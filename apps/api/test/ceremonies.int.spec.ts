import { and, desc, eq } from 'drizzle-orm';
import { CONSENT_VERSION, type Stage } from '@iskcon/contracts';
import { auditLog, guruResponses, outboxEvents, registerEntries } from '../src/database/schema';
import { GuruResponseReader } from '../src/modules/ceremonies';
import { ApplicationWorkflow } from '../src/shared/application-ports';
import { buildWorld, type Client, type TestWorld } from './helpers/test-app';

const consent = { accepted: true, version: CONSENT_VERSION };
const TODAY = '2026-10-14';
const PAST = '2026-10-10';
const FUTURE = '2026-11-20';

/** The steps from the first stage a track starts at up to RECOMMENDED. */
const PATH: Record<'FIRST' | 'SECOND', Stage[]> = {
  FIRST: ['SHELTER', 'PREPARING', 'APPLIED', 'RECOMMENDED'],
  SECOND: ['APPLIED', 'RECOMMENDED'],
};

describe('ceremonies (integration)', () => {
  let w: TestWorld;

  beforeAll(async () => {
    w = await buildWorld();
    w.clock.set(`${TODAY}T06:00:00Z`);
    // The guru's answer belongs to the `recommendations` module. The ceremonies module reads it through
    // the `GuruResponseReader` port (by default via the application-file facets). These tests bind the
    // port to the `guru_responses` table, so they do not depend on the other module's facet.
    const reader = w.app.get(GuruResponseReader);
    jest.spyOn(reader, 'latest').mockImplementation(async (app) => {
      const [row] = await w.db
        .select({ response: guruResponses.response })
        .from(guruResponses)
        .where(and(eq(guruResponses.tenantId, w.ctx.peek()!.tenantId), eq(guruResponses.applicationId, app.id)))
        .orderBy(desc(guruResponses.recordedAt))
        .limit(1);
      return row?.response ?? null;
    });
  });
  afterAll(() => w.close());

  async function setup() {
    const t = await w.newTenant();
    const [adminU, committeeU, presidentU, mentorU] = await Promise.all([
      w.newUser(t, { name: 'Admin', roles: ['ADMIN'] }),
      w.newUser(t, { name: 'Committee', roles: ['COMMITTEE'] }),
      w.newUser(t, { name: 'President', roles: ['PRESIDENT'] }),
      w.newUser(t, { name: 'Mentor', roles: ['MENTOR'] }),
    ]);
    const [admin, committee, president, mentor] = await Promise.all([adminU, committeeU, presidentU, mentorU].map((u) => w.signIn(t, u)));
    const guru = (await admin!.post('/gurus', { name: 'HH Lokanath Test Swami' }).expect(201)).body as { id: string; name: string };
    const otherGuru = (await admin!.post('/gurus', { name: 'HH Other Test Swami' }).expect(201)).body as { id: string; name: string };
    return {
      t,
      adminU,
      committeeU,
      admin: admin!,
      committee: committee!,
      president: president!,
      mentor: mentor!,
      guru,
      otherGuru,
    };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  /** A candidate moved to `stage` (default RECOMMENDED) whose guru's office has `answer`ed. */
  async function candidate(
    s: S,
    name: string,
    opts: { guruId?: string; track?: 'FIRST' | 'SECOND'; answer?: 'ACCEPTED' | 'WAIT' | 'DECLINED' | null; upTo?: Stage } = {},
  ): Promise<string> {
    const track = opts.track ?? 'FIRST';
    const body = { name, track, guruId: opts.guruId ?? s.guru.id, consent, createLogin: false };
    const { applicationId } = (await s.committee.post('/candidates', body).expect(201)).body as { applicationId: string };
    const path = PATH[track];
    const steps = path.slice(0, path.indexOf(opts.upTo ?? 'RECOMMENDED') + 1);
    const workflow = w.app.get(ApplicationWorkflow);
    await w.asSystem(s.t, () => w.uow.run(async () => {
      for (const to of steps) await workflow.transition(applicationId, to);
    }));
    if (opts.answer !== null) await answer(s, applicationId, opts.answer ?? 'ACCEPTED');
    return applicationId;
  }

  async function answer(s: S, applicationId: string, response: 'ACCEPTED' | 'WAIT' | 'DECLINED', recordedAt = new Date()): Promise<void> {
    await w.db.insert(guruResponses).values({ tenantId: s.t.id, applicationId, response, recordedById: s.adminU.id, recordedAt });
  }

  async function ceremony(s: S, over: Partial<{ guruId: string; track: 'FIRST' | 'SECOND'; venue: string; date: string }> = {}) {
    const res = await s.admin.post('/ceremonies', { guruId: s.guru.id, track: 'FIRST', venue: 'Temple hall', date: PAST, ...over }).expect(201);
    return res.body as { id: string; status: string; attendees: Array<{ applicationId: string; candidateName: string; present: boolean; spiritualName: string | null; stage: string }>; date: string };
  }

  const attach = (s: S, ceremonyId: string, applicationId: string) => s.admin.post(`/ceremonies/${ceremonyId}/attendees`, { applicationId });
  const present = (s: S, ceremonyId: string, applicationId: string, extra: object = {}) =>
    s.admin.patch(`/ceremonies/${ceremonyId}/attendees/${applicationId}`, { present: true, ...extra }).expect(200);
  const detailOf = async (c: Client, applicationId: string) => (await c.get(`/applications/${applicationId}`).expect(200)).body;
  const auditActions = async (s: S) =>
    (await w.db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.tenantId, s.t.id))).map((r) => r.action);

  // ───────── planning ─────────

  it('creates ceremonies and lists them soonest first', async () => {
    const s = await setup();
    const late = await ceremony(s, { date: '2026-12-01', venue: 'Late' });
    const soon = await ceremony(s, { date: '2026-11-01', venue: 'Soon' });
    const mid = await ceremony(s, { date: '2026-11-15', venue: 'Mid' });
    expect(late).toMatchObject({ status: 'PLANNED', attendees: [] });
    const list = (await s.admin.get('/ceremonies').expect(200)).body as Array<{ id: string; guru: { name: string } }>;
    expect(list.map((c) => c.id)).toEqual([soon.id, mid.id, late.id]);
    expect(list[0]!.guru.name).toBe('HH Lokanath Test Swami');
    expect((await s.admin.get(`/ceremonies/${mid.id}`).expect(200)).body.venue).toBe('Mid');
    expect(await auditActions(s)).toContain('ceremony.created');
  });

  it('validates the body and refuses an unknown guru and an unknown ceremony', async () => {
    const s = await setup();
    const bad = await s.admin.post('/ceremonies', { guruId: s.guru.id, track: 'FIRST', venue: 'x', date: '2026-02-31' }).expect(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    await s.admin.post('/ceremonies', { guruId: '11111111-1111-4111-8111-111111111111', track: 'FIRST', venue: 'x', date: FUTURE }).expect(404);
    await s.admin.get('/ceremonies/11111111-1111-4111-8111-111111111111').expect(404);
    await s.admin.get('/ceremonies/not-a-uuid').expect(400);
  });

  // ───────── eligibility ─────────

  it('lists only applications the guru accepted, with the same guru and track, at RECOMMENDED and not attached elsewhere', async () => {
    const s = await setup();
    const target = await ceremony(s, { date: FUTURE });
    const elsewhere = await ceremony(s, { date: '2026-12-05' });

    const ok1 = await candidate(s, 'Anita Roy');
    const ok2 = await candidate(s, 'Bimal Das');
    await candidate(s, 'Wrong Guru', { guruId: s.otherGuru.id });
    await candidate(s, 'Wrong Track', { track: 'SECOND' });
    await candidate(s, 'No Answer', { answer: null });
    await candidate(s, 'Said Wait', { answer: 'WAIT' });
    await candidate(s, 'Not Yet Recommended', { upTo: 'APPLIED' });
    const taken = await candidate(s, 'Taken Elsewhere');
    await attach(s, elsewhere.id, taken).expect(201);
    // The LATEST answer counts: accepted first, then asked to wait.
    const waited = await candidate(s, 'Accepted Then Wait', { answer: null });
    await answer(s, waited, 'ACCEPTED', new Date('2026-10-01T00:00:00Z'));
    await answer(s, waited, 'WAIT', new Date('2026-10-02T00:00:00Z'));

    const eligible = (await s.admin.get(`/ceremonies/${target.id}/eligible`).expect(200)).body as Array<{ applicationId: string; candidateName: string }>;
    expect(eligible).toEqual([
      { applicationId: ok1, candidateName: 'Anita Roy' },
      { applicationId: ok2, candidateName: 'Bimal Das' },
    ]);

    // Once attached to this ceremony a person is no longer on offer.
    await attach(s, target.id, ok1).expect(201);
    const after = (await s.admin.get(`/ceremonies/${target.id}/eligible`).expect(200)).body as Array<{ applicationId: string }>;
    expect(after.map((e) => e.applicationId)).toEqual([ok2]);
  });

  it('is only for those who manage ceremonies', async () => {
    const s = await setup();
    const c = await ceremony(s);
    await s.committee.get(`/ceremonies/${c.id}/eligible`).expect(403);
    await s.president.get(`/ceremonies/${c.id}/eligible`).expect(403);
  });

  // ───────── attendees ─────────

  it('attaches, detaches and marks attendance, and refuses what is not eligible', async () => {
    const s = await setup();
    const c = await ceremony(s, { date: FUTURE });
    const anita = await candidate(s, 'Anita Roy');
    const stranger = await candidate(s, 'Other Guru Person', { guruId: s.otherGuru.id });
    const unanswered = await candidate(s, 'Unanswered', { answer: null });
    const early = await candidate(s, 'Early Stage', { upTo: 'APPLIED' });
    const second = await candidate(s, 'Second Track', { track: 'SECOND' });

    const attached = (await attach(s, c.id, anita).expect(201)).body;
    expect(attached.attendees).toEqual([{ applicationId: anita, candidateName: 'Anita Roy', present: false, spiritualName: null, stage: 'RECOMMENDED' }]);

    // Refusals.
    const noAnswer = await attach(s, c.id, unanswered).expect(422);
    expect(noAnswer.body.code).toBe('CANDIDATE_NOT_ACCEPTED');
    expect((await attach(s, c.id, stranger).expect(422)).body.errors.map((e: { code: string }) => e.code)).toEqual(['GURU_MISMATCH']);
    expect((await attach(s, c.id, early).expect(422)).body.errors.map((e: { code: string }) => e.code)).toContain('STAGE_NOT_RECOMMENDED');
    expect((await attach(s, c.id, second).expect(422)).body.errors.map((e: { code: string }) => e.code)).toContain('TRACK_MISMATCH');
    await attach(s, c.id, anita).expect(409); // already on the list
    await attach(s, c.id, '11111111-1111-4111-8111-111111111111').expect(404);

    // One planned ceremony at a time.
    const other = await ceremony(s, { date: '2026-12-20' });
    await attach(s, other.id, anita).expect(409);

    // Attendance.
    const marked = (await present(s, c.id, anita, { spiritualName: 'Gaura Priya Devi Dasi' })).body;
    expect(marked.attendees[0]).toMatchObject({ present: true, spiritualName: 'Gaura Priya Devi Dasi' });
    const unmarked = (await s.admin.patch(`/ceremonies/${c.id}/attendees/${anita}`, { present: false }).expect(200)).body;
    expect(unmarked.attendees[0]).toMatchObject({ present: false, spiritualName: 'Gaura Priya Devi Dasi' });
    await s.admin.patch(`/ceremonies/${c.id}/attendees/${stranger}`, { present: true }).expect(404);

    // Detach: back on offer, and free for another ceremony.
    expect((await s.admin.delete(`/ceremonies/${c.id}/attendees/${anita}`).expect(200)).body.attendees).toEqual([]);
    await s.admin.delete(`/ceremonies/${c.id}/attendees/${anita}`).expect(404);
    await attach(s, other.id, anita).expect(201);

    expect(await auditActions(s)).toEqual(expect.arrayContaining(['ceremony.attendee-attached', 'ceremony.attendee-detached', 'ceremony.attendance-marked']));
  });

  // ───────── completion ─────────

  it('completes atomically: register entries, initiated and closed applications, first initiation date, event and audit', async () => {
    const s = await setup();
    const anita = await candidate(s, 'Anita Roy');
    const bimal = await candidate(s, 'Bimal Das');
    const absent = await candidate(s, 'Chitra Sen');
    const c = await ceremony(s, { date: PAST });
    for (const a of [anita, bimal, absent]) await attach(s, c.id, a).expect(201);
    await present(s, c.id, anita);
    await present(s, c.id, bimal, { spiritualName: 'Noted Das' });

    const done = (await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [anita]: 'Gaura Priya Devi Dasi', [bimal]: 'Bimal Krishna Das' } }).expect(201)).body;
    expect(done.status).toBe('COMPLETED');
    expect(done.attendees).toEqual([
      { applicationId: anita, candidateName: 'Anita Roy', present: true, spiritualName: 'Gaura Priya Devi Dasi', stage: 'INITIATED' },
      { applicationId: bimal, candidateName: 'Bimal Das', present: true, spiritualName: 'Bimal Krishna Das', stage: 'INITIATED' },
    ]);

    // Register entries.
    const register = (await s.admin.get('/register').expect(200)).body;
    expect(register.total).toBe(2);
    expect(register.items.find((e: { applicationId: string }) => e.applicationId === anita)).toMatchObject({
      candidateName: 'Anita Roy',
      spiritualName: 'Gaura Priya Devi Dasi',
      track: 'FIRST',
      guru: { id: s.guru.id, name: 'HH Lokanath Test Swami' },
      ceremonyId: c.id,
      initiatedOn: PAST,
    });

    // Applications: initiated, closed, first initiation date recorded.
    for (const a of [anita, bimal]) {
      const d = await detailOf(s.admin, a);
      expect(d).toMatchObject({ stage: 'INITIATED', status: 'COMPLETED', facts: { firstInitiationDate: PAST } });
    }
    // The absent one stays RECOMMENDED, open, detached, and can join the next ceremony.
    expect(await detailOf(s.admin, absent)).toMatchObject({ stage: 'RECOMMENDED', status: 'OPEN' });
    const next = await ceremony(s, { date: FUTURE });
    expect(((await s.admin.get(`/ceremonies/${next.id}/eligible`).expect(200)).body as Array<{ applicationId: string }>).map((e) => e.applicationId)).toEqual([absent]);

    // Event and audit.
    const events = await w.db.select().from(outboxEvents).where(and(eq(outboxEvents.tenantId, s.t.id), eq(outboxEvents.type, 'ceremony.completed')));
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ ceremonyId: c.id, applicationIds: [anita, bimal], date: PAST });
    const actions = await auditActions(s);
    expect(actions.filter((a) => a === 'register.entry-created')).toHaveLength(2);
    expect(actions.filter((a) => a === 'application.initiation-recorded')).toHaveLength(2);
    expect(actions).toEqual(expect.arrayContaining(['ceremony.completed', 'application.stage-changed', 'application.closed']));
    const [completed] = await w.db.select().from(auditLog).where(and(eq(auditLog.tenantId, s.t.id), eq(auditLog.action, 'ceremony.completed')));
    expect(completed!.detail).toMatchObject({ initiatedApplicationIds: [anita, bimal], detachedAbsentApplicationIds: [absent] });

    // The timeline of an initiated person shows the register entry.
    const timeline = (await s.admin.get(`/applications/${anita}/timeline`).expect(200)).body as Array<{ kind: string; summary: { params?: { spiritualName?: string } } }>;
    expect(timeline.filter((e) => e.kind === 'REGISTER')).toHaveLength(1);
  });

  it('completes on the day itself, and a second-track ceremony does not set a first initiation date', async () => {
    const s = await setup();
    const a = await candidate(s, 'Second Timer', { track: 'SECOND' });
    const c = await ceremony(s, { track: 'SECOND', date: TODAY });
    await attach(s, c.id, a).expect(201);
    await present(s, c.id, a);
    await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [a]: 'Second Das' } }).expect(201);
    const d = await detailOf(s.admin, a);
    expect(d).toMatchObject({ stage: 'INITIATED', status: 'COMPLETED' });
    expect(d.facts.firstInitiationDate ?? null).toBeNull();
    const entry = (await s.admin.get('/register').expect(200)).body.items[0];
    expect(entry).toMatchObject({ track: 'SECOND', initiatedOn: TODAY });
  });

  it('needs a spiritual name for everyone present and changes nothing without it', async () => {
    const s = await setup();
    const anita = await candidate(s, 'Anita Roy');
    const bimal = await candidate(s, 'Bimal Das');
    const c = await ceremony(s);
    for (const a of [anita, bimal]) {
      await attach(s, c.id, a).expect(201);
      await present(s, c.id, a);
    }
    const res = await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [anita]: 'Gaura Das' } }).expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors).toEqual([
      { path: `spiritualNames.${bimal}`, code: 'SPIRITUAL_NAME_REQUIRED', params: { candidateName: 'Bimal Das' } },
    ]);
    const none = await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: {} }).expect(422);
    expect(none.body.errors.map((e: { path: string }) => e.path).sort()).toEqual([`spiritualNames.${anita}`, `spiritualNames.${bimal}`].sort());
    // A blank name does not count either (the body is trimmed, so it is refused as invalid).
    await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [anita]: '   ', [bimal]: 'Bimal Das' } }).expect(400);

    expect((await s.admin.get(`/ceremonies/${c.id}`).expect(200)).body.status).toBe('PLANNED');
    expect((await s.admin.get('/register').expect(200)).body.total).toBe(0);
    expect(await detailOf(s.admin, anita)).toMatchObject({ stage: 'RECOMMENDED', status: 'OPEN' });
  });

  it('refuses to complete before the date, with nobody present, or with the wrong body', async () => {
    const s = await setup();
    const a = await candidate(s, 'Anita Roy');
    const future = await ceremony(s, { date: '2026-10-15' }); // tomorrow
    await attach(s, future.id, a).expect(201);
    await present(s, future.id, a);
    const early = await s.admin.post(`/ceremonies/${future.id}/complete`, { spiritualNames: { [a]: 'Gaura Das' } }).expect(422);
    expect(early.body.errors[0]).toMatchObject({ path: 'date', code: 'DATE_IN_FUTURE' });
    // Nothing was written, and it is still planned.
    expect((await s.admin.get(`/ceremonies/${future.id}`).expect(200)).body.status).toBe('PLANNED');

    const empty = await ceremony(s);
    const b = await candidate(s, 'Bimal Das');
    await attach(s, empty.id, b).expect(201); // attached but not marked present
    const nobody = await s.admin.post(`/ceremonies/${empty.id}/complete`, { spiritualNames: {} }).expect(422);
    expect(nobody.body.errors[0].code).toBe('NOBODY_PRESENT');
    await s.admin.post(`/ceremonies/${empty.id}/complete`, {}).expect(400);
  });

  it('rolls everything back when any step fails (forced failure on the second attendee)', async () => {
    const s = await setup();
    const anita = await candidate(s, 'Anita Roy');
    const bimal = await candidate(s, 'Bimal Das');
    const c = await ceremony(s);
    for (const a of [anita, bimal]) {
      await attach(s, c.id, a).expect(201);
      await present(s, c.id, a);
    }
    const workflow = w.app.get(ApplicationWorkflow);
    const original = workflow.recordInitiation.bind(workflow);
    let calls = 0;
    const spy = jest.spyOn(workflow, 'recordInitiation').mockImplementation(async (id, date) => {
      if (++calls === 2) throw new Error('forced failure');
      return original(id, date);
    });
    try {
      await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [anita]: 'Gaura Das', [bimal]: 'Bimal Das Das' } }).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(calls).toBe(2);

    // Nothing of the first attendee's work survived.
    expect(await w.db.select().from(registerEntries).where(eq(registerEntries.tenantId, s.t.id))).toHaveLength(0);
    for (const a of [anita, bimal]) expect(await detailOf(s.admin, a)).toMatchObject({ stage: 'RECOMMENDED', status: 'OPEN', facts: { firstInitiationDate: null } });
    expect((await s.admin.get(`/ceremonies/${c.id}`).expect(200)).body).toMatchObject({ status: 'PLANNED' });
    expect(await w.db.select().from(outboxEvents).where(and(eq(outboxEvents.tenantId, s.t.id), eq(outboxEvents.type, 'ceremony.completed')))).toHaveLength(0);
    const actions = await auditActions(s);
    expect(actions).not.toContain('ceremony.completed');
    expect(actions).not.toContain('register.entry-created');

    // And after the fault is gone the same request succeeds.
    await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [anita]: 'Gaura Das', [bimal]: 'Bimal Das Das' } }).expect(201);
    expect((await s.admin.get('/register').expect(200)).body.total).toBe(2);
  });

  it('names the attendees who are no longer ready, and writes nothing', async () => {
    const s = await setup();
    const anita = await candidate(s, 'Anita Roy');
    const bimal = await candidate(s, 'Bimal Das');
    const c = await ceremony(s);
    for (const a of [anita, bimal]) {
      await attach(s, c.id, a).expect(201);
      await present(s, c.id, a);
    }
    // The guru's office asked Bimal to wait after he was listed: he is back at PREPARING.
    const workflow = w.app.get(ApplicationWorkflow);
    await w.asSystem(s.t, () => w.uow.run(() => workflow.transition(bimal, 'PREPARING')));

    const res = await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [anita]: 'Gaura Das', [bimal]: 'Bimal Das Das' } }).expect(422);
    expect(res.body.code).toBe('INVALID_STAGE_TRANSITION');
    expect(res.body.errors).toEqual([
      { path: `attendees.${bimal}`, code: 'ATTENDEE_NOT_RECOMMENDED', params: { candidateName: 'Bimal Das', stage: 'PREPARING', status: 'OPEN' } },
    ]);
    expect((await s.admin.get('/register').expect(200)).body.total).toBe(0);
    expect(await detailOf(s.admin, anita)).toMatchObject({ stage: 'RECOMMENDED' });
    // Detach him and the rest can go ahead.
    await s.admin.delete(`/ceremonies/${c.id}/attendees/${bimal}`).expect(200);
    await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [anita]: 'Gaura Das' } }).expect(201);
  });

  it('refuses to complete twice, and a completed ceremony cannot change', async () => {
    const s = await setup();
    const a = await candidate(s, 'Anita Roy');
    const late = await candidate(s, 'Late Comer');
    const c = await ceremony(s);
    await attach(s, c.id, a).expect(201);
    await present(s, c.id, a);
    await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [a]: 'Gaura Das' } }).expect(201);
    const again = await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [a]: 'Gaura Das' } }).expect(409);
    expect(again.body.code).toBe('CEREMONY_NOT_PLANNED');
    expect((await s.admin.get('/register').expect(200)).body.total).toBe(1);
    await s.admin.post(`/ceremonies/${c.id}/cancel`).expect(409);
    await attach(s, c.id, late).expect(409);
    await s.admin.delete(`/ceremonies/${c.id}/attendees/${a}`).expect(409);
    await s.admin.patch(`/ceremonies/${c.id}/attendees/${a}`, { present: false }).expect(409);
  });

  it('completes two ceremonies at once without writing anything twice', async () => {
    const s = await setup();
    const a = await candidate(s, 'Anita Roy');
    const c = await ceremony(s);
    await attach(s, c.id, a).expect(201);
    await present(s, c.id, a);
    const results = await Promise.all([
      s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [a]: 'Gaura Das' } }),
      s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: { [a]: 'Gaura Das' } }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await s.admin.get('/register').expect(200)).body.total).toBe(1);
  });

  // ───────── cancel ─────────

  it('cancels a planned ceremony, detaches everyone, and they stay RECOMMENDED', async () => {
    const s = await setup();
    const a = await candidate(s, 'Anita Roy');
    const c = await ceremony(s, { date: FUTURE });
    await attach(s, c.id, a).expect(201);
    const cancelled = (await s.admin.post(`/ceremonies/${c.id}/cancel`).expect(201)).body;
    expect(cancelled).toMatchObject({ status: 'CANCELLED', attendees: [] });
    expect(await detailOf(s.admin, a)).toMatchObject({ stage: 'RECOMMENDED', status: 'OPEN' });
    // Free again for another ceremony; the cancelled one offers nobody.
    const other = await ceremony(s, { date: '2026-12-20' });
    await attach(s, other.id, a).expect(201);
    expect((await s.admin.get(`/ceremonies/${c.id}/eligible`).expect(200)).body).toEqual([]);
    expect((await s.admin.post(`/ceremonies/${c.id}/cancel`).expect(409)).body.code).toBe('CEREMONY_NOT_PLANNED');
    await s.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: {} }).expect(409);
    const [row] = await w.db.select().from(auditLog).where(and(eq(auditLog.tenantId, s.t.id), eq(auditLog.action, 'ceremony.cancelled')));
    expect(row!.detail).toMatchObject({ detachedApplicationIds: [a] });
  });

  // ───────── permissions and tenants ─────────

  it('lets the administrator manage and the president and committee only read; others see nothing', async () => {
    const s = await setup();
    const c = await ceremony(s);
    for (const reader of [s.admin, s.president, s.committee]) {
      await reader.get('/ceremonies').expect(200);
      await reader.get(`/ceremonies/${c.id}`).expect(200);
    }
    const body = { guruId: s.guru.id, track: 'FIRST', venue: 'x', date: FUTURE };
    const a = '11111111-1111-4111-8111-111111111111';
    for (const reader of [s.president, s.committee, s.mentor]) {
      await reader.post('/ceremonies', body).expect(403);
      await reader.post(`/ceremonies/${c.id}/attendees`, { applicationId: a }).expect(403);
      await reader.delete(`/ceremonies/${c.id}/attendees/${a}`).expect(403);
      await reader.patch(`/ceremonies/${c.id}/attendees/${a}`, { present: true }).expect(403);
      await reader.post(`/ceremonies/${c.id}/complete`, { spiritualNames: {} }).expect(403);
      await reader.post(`/ceremonies/${c.id}/cancel`).expect(403);
    }
    await s.mentor.get('/ceremonies').expect(403);
    await s.mentor.get(`/ceremonies/${c.id}`).expect(403);
    await w.anonymous(s.t).get('/ceremonies').expect(401);
  });

  it('keeps temples apart', async () => {
    const one = await setup();
    const two = await setup();
    const c = await ceremony(one, { date: FUTURE });
    const a = await candidate(one, 'Anita Roy');
    await attach(one, c.id, a).expect(201);
    const mine = await candidate(two, 'Their Own');

    expect((await two.admin.get('/ceremonies').expect(200)).body).toEqual([]);
    await two.admin.get(`/ceremonies/${c.id}`).expect(404);
    await two.admin.get(`/ceremonies/${c.id}/eligible`).expect(404);
    await two.admin.post(`/ceremonies/${c.id}/cancel`).expect(404);
    await two.admin.post(`/ceremonies/${c.id}/attendees`, { applicationId: mine }).expect(404);
    await two.admin.post(`/ceremonies/${c.id}/complete`, { spiritualNames: {} }).expect(404);
    // Another temple's guru or application cannot be used.
    await two.admin.post('/ceremonies', { guruId: one.guru.id, track: 'FIRST', venue: 'x', date: FUTURE }).expect(404);
    const own = await ceremony(two, { date: FUTURE });
    await attach(two, own.id, a).expect(404);
    // And the first temple's ceremony is untouched.
    expect((await one.admin.get(`/ceremonies/${c.id}`).expect(200)).body.attendees).toHaveLength(1);
  });
});
