import { and, eq } from 'drizzle-orm';
import { inflateRawSync } from 'node:zlib';
import { auditLog, guruResponses, outboxEvents, packageExports, recommendations, users } from '../src/database/schema';
import { buildWorld, type Client, type TestUser, type TestWorld } from './helpers/test-app';

const consent = { accepted: true, version: '2026-10-draft-1' };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const baseParams = (over: object = {}) => ({
  practiceMonths: 12,
  shelterMonths: 6,
  secondGapMonths: 12,
  changeGuruMonths: 6,
  returnGapMonths: 24,
  examRequired: true,
  courseRequired: true,
  letterRequired: true,
  requiredDocuments: [],
  ...over,
});

/** Reads a zip from its central directory: name -> uncompressed bytes. */
function readZip(zip: Buffer): Record<string, Buffer> {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out: Record<string, Buffer> = {};
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const offset = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const raw = zip.subarray(dataStart, dataStart + compSize);
    out[name] = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const binary = (res: { on(e: string, cb: (c?: Buffer) => void): void }, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c) => chunks.push(c as Buffer));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('recommendations (integration)', () => {
  let w: TestWorld;
  beforeAll(async () => {
    w = await buildWorld();
    w.clock.set('2026-10-14T06:00:00Z');
  });
  afterAll(() => w.close());

  async function userIdByEmail(tenantId: string, email: string): Promise<string> {
    const [u] = await w.db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.email, email)));
    return u!.id;
  }

  async function setup(templeName = 'ISKCON Newtown') {
    const t = await w.newTenant(templeName);
    const mentorU = await w.newUser(t, { name: 'Mohan Biswas', roles: ['MENTOR'] });
    const otherMentorU = await w.newUser(t, { name: 'Other Mentor', roles: ['MENTOR'] });
    const committeeU = await w.newUser(t, { name: 'Committee Member', roles: ['COMMITTEE'] });
    const presidentU = await w.newUser(t, { name: 'Temple President', roles: ['PRESIDENT'] });
    const adminU = await w.newUser(t, { name: 'Admin', roles: ['ADMIN'] });
    const [mentor, otherMentor, committee, president, admin] = await Promise.all(
      [mentorU, otherMentorU, committeeU, presidentU, adminU].map((u) => w.signIn(t, u)),
    );
    const guru = (await admin!.post('/gurus', { name: 'HH Test Swami' }).expect(201)).body;
    return { t, mentorU, mentor: mentor!, otherMentor: otherMentor!, committee: committee!, president: president!, admin: admin!, guru };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;

  /**
   * A candidate with a login whose file has reached the stage asked for. `complete` files have every
   * record and the certificate; incomplete ones lack the certificate (R-4 unknown).
   */
  async function file(s: Setup, opts: { name?: string; email?: string; at?: 'PREPARING' | 'APPLIED'; complete?: boolean; guru?: boolean } = {}) {
    const name = opts.name ?? 'Priya Ghosh';
    const email = opts.email ?? `${Math.random().toString(36).slice(2, 10)}@example.org`;
    const created = (await s.committee.post('/candidates', { name, email, mentorId: s.mentorU.id, consent }).expect(201)).body;
    const id = created.applicationId as string;
    const p = `/applications/${id}`;
    await s.mentor.patch(`${p}/facts`, { practiceSince: '2024-01-10' }).expect(200);
    await s.committee.post(`${p}/advance`, { to: 'SHELTER', shelterDate: '2025-03-01' }).expect(201);
    await s.committee.post(`${p}/advance`, { to: 'PREPARING' }).expect(201);
    await s.committee.patch(`${p}/facts`, { examStatus: 'PASSED', courseComplete: true }).expect(200);
    if (opts.guru !== false) await s.committee.patch(`${p}/guru`, { guruId: s.guru.id }).expect(200);
    if (opts.complete !== false) await upload(s.mentor, id, 'COURSE_CERTIFICATE', 'course.pdf').expect(201);
    if ((opts.at ?? 'APPLIED') === 'APPLIED') await s.mentor.post(`${p}/submit`, { readinessNote: 'Ready.' }).expect(201);
    const user: TestUser = { id: await userIdByEmail(s.t.id, email), name, email, phone: null, roles: ['CANDIDATE'] };
    return { id, p, name, email, candidate: await w.signIn(s.t, user) };
  }

  const upload = (c: Client, applicationId: string, type: string, filename: string, bytes: Buffer = PDF) =>
    c.raw('post', `/applications/${applicationId}/documents`).field('type', type).attach('file', bytes, { filename });

  const detail = async (c: Client, id: string) => (await c.get(`/applications/${id}`).expect(200)).body;
  const events = async (s: Setup, type: string) =>
    (await w.db.select().from(outboxEvents).where(and(eq(outboxEvents.tenantId, s.t.id), eq(outboxEvents.type, type)))).map((e) => e.payload);
  const audits = (s: Setup, action: string) => w.db.select().from(auditLog).where(and(eq(auditLog.tenantId, s.t.id), eq(auditLog.action, action)));

  // ───────────────────────── decisions ─────────────────────────

  it('takes a complete file to RECOMMENDED, pinned to the rule version, audited and announced', async () => {
    const s = await setup();
    const f = await file(s);
    const before = await detail(s.president, f.id);
    expect(before.actions).toMatchObject({ canDecide: true, canRecordException: false, canExportPackage: true, canRecordGuruResponse: false, approveBlockedBy: [] });
    expect(before.evaluation.canApprove).toBe(true);

    const res = await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    expect(res.body).toMatchObject({ applicationId: f.id, decision: 'APPROVE', stage: 'RECOMMENDED', status: 'OPEN' });

    const after = await detail(s.president, f.id);
    expect(after).toMatchObject({ stage: 'RECOMMENDED', status: 'OPEN' });
    expect(after.latestRecommendation).toMatchObject({
      decision: 'APPROVE',
      reason: null,
      decidedBy: 'Temple President',
      ruleVersion: { ruleSetName: 'GBC baseline', version: 1 },
    });
    expect(after.evaluation.items.find((i: { id: string }) => i.id === 'R-5').status).toBe('MET');
    expect(after.actions).toMatchObject({ canDecide: false, canRecordGuruResponse: false });
    expect((await detail(s.committee, f.id)).actions).toMatchObject({ canDecide: false, canRecordGuruResponse: true, canRecordException: false });

    const [row] = await w.db.select().from(recommendations).where(eq(recommendations.applicationId, f.id));
    expect(row).toMatchObject({ decision: 'APPROVE', ruleSetVersionId: after.latestRecommendation.ruleVersion.id });
    const snap = row!.evaluationSnapshot as { params: { shelterMonths: number }; evaluation: { canApprove: boolean; items: unknown[] }; guru: { name: string } };
    expect(snap.params.shelterMonths).toBe(6);
    expect(snap.evaluation.canApprove).toBe(true);
    expect(snap.evaluation.items.length).toBeGreaterThan(3);
    expect(snap.guru.name).toBe('HH Test Swami');

    const [line] = await audits(s, 'recommendation.approved');
    expect(line).toMatchObject({ applicationId: f.id, ruleSetVersionId: row!.ruleSetVersionId, actorName: 'Temple President' });
    expect(await events(s, 'application.approved')).toMatchObject([{ applicationId: f.id }]);
    expect((await audits(s, 'application.stage-changed')).some((l) => (l.detail as { to?: string }).to === 'RECOMMENDED')).toBe(true);

    const timeline = (await s.committee.get(`${f.p}/timeline`).expect(200)).body;
    expect(timeline.find((e: { kind: string }) => e.kind === 'RECOMMENDATION')).toMatchObject({
      actor: 'Temple President',
      summary: { code: 'timeline.recommendation.approve' },
      ruleSetVersionId: row!.ruleSetVersionId,
    });
  });

  it('refuses approval while the checklist has open items, then approves once the committee records an exception', async () => {
    const s = await setup();
    const f = await file(s, { complete: false }); // course complete, certificate missing: R-4 unknown
    const d = await detail(s.president, f.id);
    expect(d.actions).toMatchObject({ canDecide: true, approveBlockedBy: ['R-4'] });

    const blocked = await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(422);
    expect(blocked.body).toMatchObject({ code: 'APPROVAL_BLOCKED', params: { blockers: 'R-4' } });
    expect((await detail(s.president, f.id)).stage).toBe('APPLIED');
    expect(await w.db.select().from(recommendations).where(eq(recommendations.applicationId, f.id))).toHaveLength(0);
    expect(await events(s, 'application.approved')).toHaveLength(0);

    const ex = (await s.committee.post(`${f.p}/exceptions`, { ruleId: 'R-4', reason: 'Certificate is with the Course office; confirmed by phone.' }).expect(201)).body;
    expect(ex).toMatchObject({ ruleId: 'R-4', reason: expect.stringContaining('confirmed'), recordedBy: 'Committee Member' });
    const covered = await detail(s.president, f.id);
    expect(covered.exceptions).toHaveLength(1);
    expect(covered.evaluation.items.find((i: { id: string }) => i.id === 'R-4')).toMatchObject({ status: 'EXCEPTION', originalStatus: 'UNKNOWN', source: 'COMMITTEE_EXCEPTION' });
    expect(covered.actions.approveBlockedBy).toEqual([]);

    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    const [row] = await w.db.select().from(recommendations).where(eq(recommendations.applicationId, f.id));
    const snap = row!.evaluationSnapshot as { evaluation: { items: Array<{ id: string; status: string; detail: { params?: { reason?: string } } }> } };
    const r4 = snap.evaluation.items.find((i) => i.id === 'R-4')!;
    expect(r4.status).toBe('EXCEPTION');
    expect(r4.detail.params?.reason).toContain('Course office'); // the snapshot keeps the reason the committee gave

    const timeline = (await s.president.get(`${f.p}/timeline`)).body;
    expect(timeline.filter((e: { kind: string }) => e.kind === 'EXCEPTION')).toHaveLength(1);
  });

  it('does not trust the client about the checklist: a missing record blocks approval whatever the screen showed', async () => {
    const s = await setup();
    const f = await file(s, { complete: false });
    // Even a request that claims everything is fine is evaluated by the server.
    const res = await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE', canApprove: true, evaluation: { canApprove: true, blockers: [] } }).expect(422);
    expect(res.body.code).toBe('APPROVAL_BLOCKED');
  });

  it('records exceptions with the rules that apply: not R-5, not unknown rules, only while the file is with the president, one per rule', async () => {
    const s = await setup();
    const f = await file(s, { complete: false });
    const r5 = await s.committee.post(`${f.p}/exceptions`, { ruleId: 'R-5', reason: 'Please waive the letter' }).expect(400);
    expect(r5.body.errors[0]).toMatchObject({ path: 'ruleId', code: 'RULE_NOT_EXCEPTABLE' });
    await s.committee.post(`${f.p}/exceptions`, { ruleId: 'R-9', reason: 'x' }).expect(400);
    await s.committee.post(`${f.p}/exceptions`, { ruleId: 'R-4', reason: '' }).expect(400);

    // One per rule: recording again replaces the reason.
    await s.committee.post(`${f.p}/exceptions`, { ruleId: 'R-4', reason: 'First reason' }).expect(201);
    await s.committee.post(`${f.p}/exceptions`, { ruleId: 'R-4', reason: 'Second reason' }).expect(201);
    const d = await detail(s.committee, f.id);
    expect(d.exceptions).toHaveLength(1);
    expect(d.exceptions[0].reason).toBe('Second reason');
    expect(d.actions.canRecordException).toBe(true);
    expect(await audits(s, 'exception.recorded')).toHaveLength(2);

    // Who may.
    await s.president.post(`${f.p}/exceptions`, { ruleId: 'R-4', reason: 'x' }).expect(403);
    await s.mentor.post(`${f.p}/exceptions`, { ruleId: 'R-4', reason: 'x' }).expect(403);
    await s.admin.post(`${f.p}/exceptions`, { ruleId: 'R-4', reason: 'x' }).expect(403);
    await f.candidate.delete(`${f.p}/exceptions/R-4`).expect(403);

    await s.committee.delete(`${f.p}/exceptions/R-4`).expect(204);
    await s.committee.delete(`${f.p}/exceptions/R-4`).expect(404);
    await s.committee.delete(`${f.p}/exceptions/R-99`).expect(400);
    expect((await detail(s.committee, f.id)).exceptions).toEqual([]);
    expect(await audits(s, 'exception.removed')).toHaveLength(1);
    const timeline = (await s.committee.get(`${f.p}/timeline`)).body;
    expect(timeline.filter((e: { summary: { code: string } }) => e.summary.code === 'timeline.exception.removed')).toHaveLength(1);

    // Only while the file is with the president.
    const early = await file(s, { at: 'PREPARING', email: 'early@example.org' });
    const wrongStage = await s.committee.post(`${early.p}/exceptions`, { ruleId: 'R-4', reason: 'Too early' }).expect(409);
    expect(wrongStage.body).toMatchObject({ code: 'CONFLICT', params: { stage: 'PREPARING' } });
    await s.president.post(`${f.p}/recommendation`, { decision: 'DECLINE', reason: 'Not now' }).expect(201);
    await s.committee.post(`${f.p}/exceptions`, { ruleId: 'R-4', reason: 'Too late' }).expect(409);
  });

  it('sends a file back with a reason the candidate and the mentor can read', async () => {
    const s = await setup();
    const f = await file(s);
    const noReason = await s.president.post(`${f.p}/recommendation`, { decision: 'SEND_BACK' }).expect(400);
    expect(noReason.body.errors[0]).toMatchObject({ path: 'reason', code: 'REASON_REQUIRED' });
    await s.president.post(`${f.p}/recommendation`, { decision: 'SEND_BACK', reason: '   ' }).expect(400);

    const res = await s.president.post(`${f.p}/recommendation`, { decision: 'SEND_BACK', reason: 'Please add the shelter acceptance letter.' }).expect(201);
    expect(res.body).toMatchObject({ decision: 'SEND_BACK', stage: 'PREPARING', status: 'OPEN' });

    for (const reader of [f.candidate, s.mentor]) {
      const notes = (await reader.get(`${f.p}/notes`).expect(200)).body;
      expect(notes.filter((n: { kind: string }) => n.kind === 'SEND_BACK')).toMatchObject([{ body: 'Please add the shelter acceptance letter.', author: { name: 'Temple President' } }]);
      const d = await detail(reader, f.id);
      expect(d.stage).toBe('PREPARING');
      expect(d.latestRecommendation).toMatchObject({ decision: 'SEND_BACK', reason: 'Please add the shelter acceptance letter.' });
    }
    expect((await detail(s.mentor, f.id)).actions.canSubmit).toBe(true);
    expect(await events(s, 'application.sent-back')).toMatchObject([{ applicationId: f.id, reason: 'Please add the shelter acceptance letter.' }]);
    const [line] = await audits(s, 'recommendation.sent-back');
    expect(line!.detail).toMatchObject({ decision: 'SEND_BACK', reason: expect.stringContaining('shelter') });

    // The mentor fixes it and submits again; the president can then decide anew.
    await s.mentor.post(`${f.p}/submit`, { readinessNote: 'Added.' }).expect(201);
    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    expect(await w.db.select().from(recommendations).where(eq(recommendations.applicationId, f.id))).toHaveLength(2);
  });

  it('declines a file: closed, with the reason, and announced', async () => {
    const s = await setup();
    const f = await file(s);
    await s.president.post(`${f.p}/recommendation`, { decision: 'DECLINE' }).expect(400);
    const res = await s.president.post(`${f.p}/recommendation`, { decision: 'DECLINE', reason: 'Not ready yet.' }).expect(201);
    expect(res.body).toMatchObject({ decision: 'DECLINE', status: 'DECLINED' });
    const d = await detail(s.committee, f.id);
    expect(d).toMatchObject({ status: 'DECLINED', stage: 'APPLIED' });
    expect(d.latestRecommendation).toMatchObject({ decision: 'DECLINE', reason: 'Not ready yet.' });
    expect(d.actions).toMatchObject({ canDecide: false, canRecordException: false });
    expect(await events(s, 'application.declined')).toMatchObject([{ applicationId: f.id, by: 'PRESIDENT', reason: 'Not ready yet.' }]);
    expect(await audits(s, 'recommendation.declined')).toHaveLength(1);
    expect((await audits(s, 'application.closed'))[0]!.detail).toMatchObject({ status: 'DECLINED' });
    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(409);
  });

  it('lets only the president decide, and only a submitted file', async () => {
    const s = await setup();
    const f = await file(s);
    for (const who of [s.committee, s.admin, s.mentor, f.candidate]) await who.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(403);
    const early = await file(s, { at: 'PREPARING' });
    const res = await s.president.post(`${early.p}/recommendation`, { decision: 'APPROVE' }).expect(409);
    expect(res.body).toMatchObject({ code: 'CONFLICT', params: { stage: 'PREPARING' } });
    await s.president.post(`${f.p}/recommendation`, { decision: 'MAYBE' }).expect(400);
    await s.president.post(`/applications/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}/recommendation`, { decision: 'APPROVE' }).expect(404);
  });

  it('lets exactly one of two simultaneous approvals through (the file is locked)', async () => {
    const s = await setup();
    const f = await file(s);
    const results = await Promise.all([
      s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }),
      s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, expect.any(Number)]);
    expect([409, 422]).toContain(results.map((r) => r.status).sort()[1]);
    expect(await w.db.select().from(recommendations).where(eq(recommendations.applicationId, f.id))).toHaveLength(1);
    expect(await events(s, 'application.approved')).toHaveLength(1);
  });

  // ───────────────────────── guru's office ─────────────────────────

  it('records the guru\'s answer: ACCEPTED keeps the file at RECOMMENDED', async () => {
    const s = await setup();
    const f = await file(s);
    await s.committee.post(`${f.p}/guru-response`, { response: 'ACCEPTED' }).expect(409); // not recommended yet
    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    expect((await detail(s.committee, f.id)).latestGuruResponse).toBeNull();

    const res = await s.committee.post(`${f.p}/guru-response`, { response: 'ACCEPTED' }).expect(201);
    expect(res.body).toMatchObject({ response: 'ACCEPTED', stage: 'RECOMMENDED', status: 'OPEN' });
    const d = await detail(s.committee, f.id);
    expect(d.stage).toBe('RECOMMENDED');
    expect(d.latestGuruResponse).toMatchObject({ response: 'ACCEPTED', reason: null, recordedBy: 'Committee Member' });
    expect(await events(s, 'guru.responded')).toMatchObject([{ applicationId: f.id, response: 'ACCEPTED' }]);
    expect(await audits(s, 'guru-response.recorded')).toHaveLength(1);
    const timeline = (await s.mentor.get(`${f.p}/timeline`)).body;
    expect(timeline.find((e: { kind: string }) => e.kind === 'GURU_RESPONSE').summary.code).toBe('timeline.guruResponse.accepted');

    // Who may.
    for (const who of [s.president, s.mentor, s.admin, f.candidate]) await who.post(`${f.p}/guru-response`, { response: 'ACCEPTED' }).expect(403);
  });

  it('returns the file to PREPARING when the guru\'s office asks to wait, and does not mistake the old answer for a new one', async () => {
    const s = await setup();
    const f = await file(s);
    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    const noReason = await s.committee.post(`${f.p}/guru-response`, { response: 'WAIT' }).expect(400);
    expect(noReason.body.errors[0]).toMatchObject({ path: 'reason', code: 'REASON_REQUIRED' });

    const res = await s.committee.post(`${f.p}/guru-response`, { response: 'WAIT', reason: 'Please wait until after the festival.' }).expect(201);
    expect(res.body).toMatchObject({ response: 'WAIT', stage: 'PREPARING', status: 'OPEN' });
    const d = await detail(s.mentor, f.id);
    expect(d.stage).toBe('PREPARING');
    expect(d.latestGuruResponse).toMatchObject({ response: 'WAIT', reason: 'Please wait until after the festival.' });
    const stages = (await s.mentor.get(`${f.p}/timeline`)).body.filter((e: { kind: string }) => e.kind === 'STAGE');
    expect(stages[stages.length - 1].summary.params).toMatchObject({ from: 'RECOMMENDED', to: 'PREPARING', reason: 'Please wait until after the festival.' });
    // No letter while the file is back with the mentor.
    await s.president.get(`${f.p}/recommendation/letter`).expect(409);

    await s.mentor.post(`${f.p}/submit`, { readinessNote: 'Ready again.' }).expect(201);
    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    const again = await detail(s.committee, f.id);
    expect(again.stage).toBe('RECOMMENDED');
    expect(again.latestGuruResponse).toBeNull(); // the earlier WAIT belongs to the earlier recommendation
    expect(again.actions.canRecordGuruResponse).toBe(true);
    expect(await w.db.select().from(guruResponses).where(eq(guruResponses.applicationId, f.id))).toHaveLength(1);
  });

  it('closes the file when the guru\'s office declines', async () => {
    const s = await setup();
    const f = await file(s);
    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    await s.committee.post(`${f.p}/guru-response`, { response: 'DECLINED' }).expect(400);
    const res = await s.committee.post(`${f.p}/guru-response`, { response: 'DECLINED', reason: 'Not accepting new disciples this year.' }).expect(201);
    expect(res.body).toMatchObject({ response: 'DECLINED', stage: 'RECOMMENDED', status: 'DECLINED' });
    expect((await detail(s.committee, f.id)).status).toBe('DECLINED');
    expect(await events(s, 'application.declined')).toMatchObject([{ applicationId: f.id, by: 'GURU', reason: 'Not accepting new disciples this year.' }]);
    expect(await events(s, 'guru.responded')).toMatchObject([{ applicationId: f.id, response: 'DECLINED' }]);
    await s.committee.post(`${f.p}/guru-response`, { response: 'ACCEPTED' }).expect(409);
  });

  it('keeps recommendations and guru answers append-only', async () => {
    const s = await setup();
    const f = await file(s);
    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    await s.committee.post(`${f.p}/guru-response`, { response: 'ACCEPTED' }).expect(201);
    await expect(w.db.update(recommendations).set({ decision: 'DECLINE' }).where(eq(recommendations.applicationId, f.id))).rejects.toThrow();
    await expect(w.db.delete(guruResponses).where(eq(guruResponses.applicationId, f.id))).rejects.toThrow();
  });

  // ───────────────────────── rule version pinning ─────────────────────────

  it('keeps the decision pinned to the rule version it was made under after the rules are republished', async () => {
    const s = await setup();
    const f = await file(s);
    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    const before = await detail(s.president, f.id);
    const v1 = before.latestRecommendation.ruleVersion;
    expect(v1).toMatchObject({ version: 1, ruleSetName: 'GBC baseline' });

    // The temple raises the numbers and asks for an essay; version 2 is published.
    const baselineId = (await s.admin.get('/rule-sets').expect(200)).body[0].id;
    await s.admin.put(`/rule-sets/${baselineId}/draft`, { params: baseParams({ shelterMonths: 24, practiceMonths: 36, requiredDocuments: ['ESSAY'] }) }).expect(200);
    await s.admin.post(`/rule-sets/${baselineId}/publish`).expect(200);

    const after = await detail(s.president, f.id);
    expect(after.ruleVersion.version).toBe(2); // the checklist now runs against the new numbers...
    expect(after.latestRecommendation.ruleVersion).toEqual(v1); // ...the recommendation does not move.
    const [row] = await w.db.select().from(recommendations).where(eq(recommendations.applicationId, f.id));
    expect(row!.ruleSetVersionId).toBe(v1.id);
    const snap = row!.evaluationSnapshot as { params: { shelterMonths: number; practiceMonths: number; requiredDocuments: string[] }; evaluation: { canApprove: boolean } };
    expect(snap.params).toMatchObject({ shelterMonths: 6, practiceMonths: 12, requiredDocuments: [] });
    expect(snap.evaluation.canApprove).toBe(true);
    const timeline = (await s.president.get(`${f.p}/timeline`)).body;
    expect(timeline.find((e: { kind: string }) => e.kind === 'RECOMMENDATION').ruleSetVersionId).toBe(v1.id);
    // The letter still renders from the snapshot.
    await s.president.get(`${f.p}/recommendation/letter`).expect(200);
  });

  // ───────────────────────── letter ─────────────────────────

  it('produces the letter only after approval, as a valid PDF, for Latin and Bengali names', async () => {
    const s = await setup('ISKCON নিউটাউন');
    const f = await file(s, { name: 'দেবাশীষ লাহিড়ী', email: 'bengali@example.org' });
    const url = `${f.p}/recommendation/letter`;
    expect((await s.president.get(url).expect(409)).body.code).toBe('CONFLICT');
    await s.committee.get(url).expect(409);

    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    for (const who of [s.president, s.committee, s.admin]) {
      const res = await who.get(url).buffer(true).parse(binary).expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="recommendation-letter-[0-9a-f]{8}\.pdf"$/);
      expect(res.headers['cache-control']).toBe('private, no-store');
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.subarray(-8).toString()).toContain('%%EOF');
      expect(pdf.toString('latin1')).toContain('NotoSansBengali'); // temple and candidate names needed the Bengali font
    }
    expect((await audits(s, 'recommendation.letter-generated')).length).toBe(3);

    // Not for mentors or candidates; invisible files are not found.
    await s.mentor.get(url).expect(403);
    await f.candidate.get(url).expect(403);
    // A Latin-script temple and candidate need no Bengali font.
    const plain = await setup('ISKCON Newtown');
    const latin = await file(plain, { name: 'Priya Ghosh', email: 'latin@example.org' });
    await plain.president.post(`${latin.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    const res = await plain.president.get(`${latin.p}/recommendation/letter`).buffer(true).parse(binary).expect(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((res.body as Buffer).toString('latin1')).not.toContain('NotoSansBengali');
  });

  it('gives no letter for a file that was sent back or declined', async () => {
    const s = await setup();
    const f = await file(s);
    await s.president.post(`${f.p}/recommendation`, { decision: 'SEND_BACK', reason: 'Not yet.' }).expect(201);
    await s.president.get(`${f.p}/recommendation/letter`).expect(409);
  });

  // ───────────────────────── package ─────────────────────────

  it('previews and exports the package, always logging what was missing', async () => {
    const s = await setup();
    // The temple asks for a course certificate and an essay.
    const baselineId = (await s.admin.get('/rule-sets')).body[0].id;
    await s.admin.put(`/rule-sets/${baselineId}/draft`, { params: baseParams({ requiredDocuments: ['COURSE_CERTIFICATE', 'ESSAY'] }) }).expect(200);
    await s.admin.post(`/rule-sets/${baselineId}/publish`).expect(200);

    const early = await file(s, { at: 'PREPARING', email: 'early@example.org' });
    await s.committee.get(`${early.p}/package/preview`).expect(409);
    await s.committee.post(`${early.p}/package`).expect(409);

    const f = await file(s, { name: 'দেবাশীষ লাহিড়ী', email: 'pkg@example.org' });
    const preview = (await s.president.get(`${f.p}/package/preview`).expect(200)).body;
    expect(preview.missingDocuments).toEqual(['ESSAY']);
    expect(preview.unmetItems).toEqual([]);
    expect(preview.generatedAt).toBe('2026-10-14T06:00:00.000Z');
    // Previewing is not exporting.
    expect(await w.db.select().from(packageExports).where(eq(packageExports.applicationId, f.id))).toHaveLength(0);

    // The mentor adds a document under a clashing name.
    await upload(s.mentor, f.id, 'OATH', 'course.pdf').expect(201);
    const res = await s.committee.post(`${f.p}/package`).buffer(true).parse(binary).expect(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="initiation-file-[0-9a-f]{8}\.zip"$/);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const entries = readZip(res.body as Buffer);
    expect(Object.keys(entries).sort()).toEqual(['00-cover.pdf', 'documents/01-COURSE_CERTIFICATE-course.pdf', 'documents/02-OATH-course.pdf']);
    expect(entries['00-cover.pdf']!.subarray(0, 5).toString()).toBe('%PDF-');
    expect(entries['00-cover.pdf']!.toString('latin1')).toContain('NotoSansBengali');
    expect(Buffer.compare(entries['documents/01-COURSE_CERTIFICATE-course.pdf']!, PDF)).toBe(0);

    const [exported] = await w.db.select().from(packageExports).where(eq(packageExports.applicationId, f.id));
    expect(exported!.missingDocuments).toEqual(['ESSAY']);
    const [line] = await audits(s, 'package.exported');
    expect(line).toMatchObject({ applicationId: f.id, actorName: 'Committee Member' });
    expect(line!.detail).toMatchObject({ missingDocuments: ['ESSAY'], documentsIncluded: 2 });

    // A complete package is logged too.
    await upload(s.mentor, f.id, 'ESSAY', 'essay.pdf').expect(201);
    await s.president.post(`${f.p}/package`).buffer(true).parse(binary).expect(200);
    const rows = await w.db.select().from(packageExports).where(eq(packageExports.applicationId, f.id));
    expect(rows.map((r) => r.missingDocuments)).toEqual([['ESSAY'], []]);

    // Staff see the exports on the timeline; the candidate does not.
    const staffTimeline = (await s.committee.get(`${f.p}/timeline`)).body;
    expect(staffTimeline.filter((e: { kind: string }) => e.kind === 'PACKAGE')).toHaveLength(2);
    expect((await f.candidate.get(`${f.p}/timeline`)).body.filter((e: { kind: string }) => e.kind === 'PACKAGE')).toHaveLength(0);

    // Who may.
    for (const who of [s.mentor, f.candidate]) {
      await who.get(`${f.p}/package/preview`).expect(403);
      await who.post(`${f.p}/package`).expect(403);
    }
  });

  // ───────────────────────── isolation ─────────────────────────

  it('keeps temples apart', async () => {
    const one = await setup();
    const two = await setup();
    const f = await file(one);
    await one.committee.post(`${f.p}/exceptions`, { ruleId: 'R-4', reason: 'Because' }).expect(201);
    await two.committee.post(`${f.p}/exceptions`, { ruleId: 'R-4', reason: 'x' }).expect(404);
    await two.committee.delete(`${f.p}/exceptions/R-4`).expect(404);
    await two.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(404);
    await two.committee.post(`${f.p}/guru-response`, { response: 'ACCEPTED' }).expect(404);
    await two.president.get(`${f.p}/recommendation/letter`).expect(404);
    await two.president.get(`${f.p}/package/preview`).expect(404);
    await two.president.post(`${f.p}/package`).expect(404);
    await two.committee.get(`${f.p}`).expect(404);
    expect((await detail(one.committee, f.id)).exceptions).toHaveLength(1);
    expect(await w.db.select().from(recommendations).where(eq(recommendations.tenantId, two.t.id))).toHaveLength(0);
  });

  it('keeps a mentor out of decisions on files that are not theirs', async () => {
    const s = await setup();
    const f = await file(s);
    await s.otherMentor.get(`${f.p}`).expect(404);
    await s.otherMentor.get(`${f.p}/package/preview`).expect(403);
    await s.otherMentor.get(`${f.p}/recommendation/letter`).expect(403);
  });

  it('freezes the file\'s documents once it is recommended', async () => {
    const s = await setup();
    const f = await file(s);
    const docs = (await s.mentor.get(`${f.p}/documents`)).body;
    await s.president.post(`${f.p}/recommendation`, { decision: 'APPROVE' }).expect(201);
    await s.admin.delete(`/documents/${docs[0].id}`).expect(409);
    // But a missing paper can still be added.
    await upload(s.mentor, f.id, 'ESSAY', 'essay.pdf').expect(201);
  });
});
