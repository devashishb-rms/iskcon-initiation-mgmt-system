import { and, eq } from 'drizzle-orm';
import { CONSENT_VERSION, type RegisterEntryDto } from '@iskcon/contracts';
import { auditLog, ceremonies, registerEntries } from '../src/database/schema';
import { RegisterService, type NewRegisterEntry } from '../src/modules/register';
import { buildWorld, type Client, type TestWorld } from './helpers/test-app';

const consent = { accepted: true, version: CONSENT_VERSION };
const NIL = '11111111-1111-4111-8111-111111111111';

/** Reads a binary response body (supertest only buffers text by default). */
const binary = (req: ReturnType<Client['get']>) =>
  req
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

describe('register (integration)', () => {
  let w: TestWorld;
  beforeAll(async () => {
    w = await buildWorld();
    w.clock.set('2026-10-14T06:00:00Z');
  });
  afterAll(() => w.close());

  async function setup() {
    const t = await w.newTenant();
    const users = await Promise.all(
      (['ADMIN', 'PRESIDENT', 'COMMITTEE', 'MENTOR', 'CANDIDATE'] as const).map((role) => w.newUser(t, { name: role, roles: [role] })),
    );
    const [admin, president, committee, mentor, candidate] = await Promise.all(users.map((u) => w.signIn(t, u)));
    const guru1 = (await admin!.post('/gurus', { name: 'HH Lokanath Test Swami' }).expect(201)).body as { id: string; name: string };
    const guru2 = (await admin!.post('/gurus', { name: 'HH Other Test Swami' }).expect(201)).body as { id: string; name: string };
    return { t, admin: admin!, president: president!, committee: committee!, mentor: mentor!, candidate: candidate!, guru1, guru2 };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  /** An application and a completed ceremony row to hang an entry on. The register does not check either. */
  async function arrange(s: S, candidateName: string, guruId: string, track: 'FIRST' | 'SECOND', initiatedOn: string): Promise<NewRegisterEntry & { spiritualName: string }> {
    const { applicationId } = (await s.committee.post('/candidates', { name: candidateName, track, guruId, consent, createLogin: false }).expect(201)).body as {
      applicationId: string;
    };
    const [c] = await w.db.insert(ceremonies).values({ tenantId: s.t.id, guruId, track, venue: 'Hall', date: initiatedOn, status: 'COMPLETED' }).returning();
    return { applicationId, candidateName, spiritualName: '', track, guruId, ceremonyId: c!.id, initiatedOn };
  }

  const write = (s: S, entries: NewRegisterEntry[]) => w.asSystem(s.t, () => w.uow.run(() => w.app.get(RegisterService).createEntries(entries)));

  /** Five entries across two gurus, both tracks, Latin, Bengali and hostile names. */
  async function fixture() {
    const s = await setup();
    const rows = [
      { ...(await arrange(s, 'Anita Roy', s.guru1.id, 'FIRST', '2026-08-20')), spiritualName: 'Gaura Priya Devi Dasi' },
      { ...(await arrange(s, 'Bimal Das', s.guru1.id, 'FIRST', '2026-09-15')), spiritualName: 'Bimal Krishna Das' },
      { ...(await arrange(s, 'দেবাশীষ লাহিড়ী', s.guru2.id, 'FIRST', '2026-10-01')), spiritualName: 'দেবাশীষ দাস' },
      { ...(await arrange(s, '=cmd|calc', s.guru1.id, 'SECOND', '2026-10-05')), spiritualName: '@SUM(1)' },
      { ...(await arrange(s, 'Hundred% Sure', s.guru2.id, 'FIRST', '2026-09-01')), spiritualName: 'Pct Das' },
    ];
    const created = await write(s, rows);
    return { s, rows, created };
  }

  const names = (body: { items: RegisterEntryDto[] }) => body.items.map((i) => i.candidateName);

  // ───────── reading ─────────

  it('lists the register, newest initiation first, with the guru and the dates as plain strings', async () => {
    const { s } = await fixture();
    const page = (await s.admin.get('/register').expect(200)).body;
    expect(page).toMatchObject({ page: 1, pageSize: 50, total: 5 });
    expect(names(page)).toEqual(['=cmd|calc', 'দেবাশীষ লাহিড়ী', 'Bimal Das', 'Hundred% Sure', 'Anita Roy']);
    expect(page.items[1]).toMatchObject({
      spiritualName: 'দেবাশীষ দাস',
      track: 'FIRST',
      guru: { id: s.guru2.id, name: 'HH Other Test Swami' },
      initiatedOn: '2026-10-01',
    });
  });

  it('searches names and spiritual names, case-insensitively, and treats % and _ literally', async () => {
    const { s } = await fixture();
    expect(names((await s.admin.get('/register?q=anita').expect(200)).body)).toEqual(['Anita Roy']);
    expect(names((await s.admin.get('/register?q=KRISHNA').expect(200)).body)).toEqual(['Bimal Das']); // spiritual name
    expect(names((await s.admin.get(`/register?q=${encodeURIComponent('দেবাশীষ')}`).expect(200)).body)).toEqual(['দেবাশীষ লাহিড়ী']);
    expect(names((await s.admin.get('/register?q=%25').expect(200)).body)).toEqual(['Hundred% Sure']); // "%" is not a wildcard
    expect((await s.admin.get('/register?q=_').expect(200)).body.total).toBe(0);
    expect((await s.admin.get('/register?q=nobody').expect(200)).body.total).toBe(0);
  });

  it('filters by guru, track and date range, and pages', async () => {
    const { s } = await fixture();
    expect(names((await s.admin.get(`/register?guruId=${s.guru2.id}`).expect(200)).body)).toEqual(['দেবাশীষ লাহিড়ী', 'Hundred% Sure']);
    expect(names((await s.admin.get('/register?track=SECOND').expect(200)).body)).toEqual(['=cmd|calc']);
    // Inclusive bounds.
    expect(names((await s.admin.get('/register?from=2026-09-01&to=2026-10-01').expect(200)).body)).toEqual(['দেবাশীষ লাহিড়ী', 'Bimal Das', 'Hundred% Sure']);
    expect(names((await s.admin.get('/register?from=2026-10-02').expect(200)).body)).toEqual(['=cmd|calc']);
    expect(names((await s.admin.get('/register?to=2026-08-31').expect(200)).body)).toEqual(['Anita Roy']);
    expect(names((await s.admin.get(`/register?guruId=${s.guru1.id}&track=FIRST&from=2026-09-01`).expect(200)).body)).toEqual(['Bimal Das']);

    const p1 = (await s.admin.get('/register?pageSize=2&page=1').expect(200)).body;
    const p2 = (await s.admin.get('/register?pageSize=2&page=2').expect(200)).body;
    const p3 = (await s.admin.get('/register?pageSize=2&page=3').expect(200)).body;
    expect([p1.total, p2.total, p3.total]).toEqual([5, 5, 5]);
    expect([...names(p1), ...names(p2), ...names(p3)]).toEqual(['=cmd|calc', 'দেবাশীষ লাহিড়ী', 'Bimal Das', 'Hundred% Sure', 'Anita Roy']);
    expect(p3.items).toHaveLength(1);
  });

  it('refuses bad filters', async () => {
    const { s } = await fixture();
    expect((await s.admin.get('/register?from=2026-10-10&to=2026-10-01').expect(400)).body.errors[0]).toMatchObject({ path: 'to', code: 'DATE_RANGE_INVALID' });
    await s.admin.get('/register?from=10-10-2026').expect(400);
    await s.admin.get('/register?guruId=nope').expect(400);
    await s.admin.get('/register?track=THIRD').expect(400);
    await s.admin.get('/register?pageSize=500').expect(400);
  });

  // ───────── exports ─────────

  it('exports CSV that cannot run formulas, with a BOM, honouring the filters', async () => {
    const { s } = await fixture();
    const res = await s.president.get('/register/export.csv').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('register.csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    const lines = res.text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Initiated on,Spiritual name,Name,Track,Guru');
    expect(lines).toHaveLength(6);
    expect(lines[1]).toBe("2026-10-05,'@SUM(1),'=cmd|calc,SECOND,HH Lokanath Test Swami");
    expect(res.text).toContain('দেবাশীষ দাস');
    // Same filters as the list.
    const filtered = await s.president.get('/register/export.csv?track=SECOND').expect(200);
    expect(filtered.text.trim().split('\r\n')).toHaveLength(2);
  });

  it('exports a valid PDF that embeds the Bengali font for Bengali names', async () => {
    const { s } = await fixture();
    const res = await binary(s.committee.get('/register/export.pdf')).expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('register.pdf');
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-8).toString()).toContain('%%EOF');
    const raw = pdf.toString('latin1');
    expect(raw).toContain('NotoSansBengali-Regular');
    expect(raw).toContain('NotoSans-Regular');
    // An empty result is still a valid document.
    const empty = await binary(s.committee.get('/register/export.pdf?q=nobody')).expect(200);
    expect((empty.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((empty.body as Buffer).toString('latin1')).not.toContain('NotoSansBengali-Regular');
  });

  it('paginates the PDF across pages for a long register', async () => {
    const s = await setup();
    const rows: NewRegisterEntry[] = [];
    for (let i = 0; i < 40; i++) rows.push({ ...(await arrange(s, `Person ${String(i).padStart(2, '0')}`, s.guru1.id, 'FIRST', '2026-09-01')), spiritualName: `Name ${i} Das` });
    await write(s, rows);
    const pdf = (await binary(s.admin.get('/register/export.pdf')).expect(200)).body as Buffer;
    expect(Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1])).toBeGreaterThan(1); // 40 rows do not fit on one landscape page
  });

  // ───────── permissions ─────────

  it('follows the role permissions for reading, exporting and correcting', async () => {
    const { s, created } = await fixture();
    const id = created[0]!.id;
    for (const reader of [s.admin, s.president, s.committee]) {
      await reader.get('/register').expect(200);
      await reader.get('/register/export.csv').expect(200);
      await reader.get('/register/export.pdf').expect(200);
    }
    for (const outsider of [s.mentor, s.candidate]) {
      await outsider.get('/register').expect(403);
      await outsider.get('/register/export.csv').expect(403);
      await outsider.get('/register/export.pdf').expect(403);
    }
    for (const other of [s.president, s.committee, s.mentor, s.candidate]) {
      await other.patch(`/register/${id}`, { spiritualName: 'Changed Das', reason: 'Because' }).expect(403);
    }
    await w.anonymous(s.t).get('/register').expect(401);
    expect((await s.admin.get('/register?q=Gaura').expect(200)).body.items[0].spiritualName).toBe('Gaura Priya Devi Dasi');
  });

  // ───────── correction ─────────

  it('corrects a spiritual name and keeps the old value, the new value and the reason in the audit log', async () => {
    const { s, created } = await fixture();
    const entry = created.find((e) => e.candidateName === 'Anita Roy')!;
    const res = (await s.admin.patch(`/register/${entry.id}`, { spiritualName: '  Gauri Priya Devi Dasi ', reason: 'Spelling in the original register' }).expect(200)).body;
    expect(res).toMatchObject({ id: entry.id, spiritualName: 'Gauri Priya Devi Dasi', candidateName: 'Anita Roy', guru: { name: 'HH Lokanath Test Swami' } });
    expect(names((await s.admin.get('/register?q=Gauri').expect(200)).body)).toEqual(['Anita Roy']);
    expect((await s.admin.get('/register?q=Gaura').expect(200)).body.total).toBe(0);

    const [row] = await w.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, s.t.id), eq(auditLog.action, 'register.corrected')));
    expect(row).toMatchObject({ entityType: 'register_entry', entityId: entry.id, applicationId: entry.applicationId, actorName: 'ADMIN' });
    expect(row!.detail).toEqual({
      before: { spiritualName: 'Gaura Priya Devi Dasi' },
      after: { spiritualName: 'Gauri Priya Devi Dasi' },
      reason: 'Spelling in the original register',
    });
    // Visible to those who may read the audit log, and a second correction adds a line instead of replacing it.
    await s.admin.patch(`/register/${entry.id}`, { spiritualName: 'Gaura Priya Devi Dasi', reason: 'Reverted: the first spelling was right' }).expect(200);
    const audit = (await s.president.get('/audit?action=register.corrected').expect(200)).body;
    expect(audit.total).toBe(2);
  });

  it('cannot be corrected without a reason, with an empty name, or to the same name', async () => {
    const { s, created } = await fixture();
    const id = created[0]!.id;
    const missing = await s.admin.patch(`/register/${id}`, { spiritualName: 'New Das' }).expect(400);
    expect(missing.body.errors[0].path).toBe('reason');
    await s.admin.patch(`/register/${id}`, { spiritualName: 'New Das', reason: '   ' }).expect(400);
    await s.admin.patch(`/register/${id}`, { spiritualName: '  ', reason: 'x' }).expect(400);
    const same = await s.admin.patch(`/register/${id}`, { spiritualName: ' Gaura Priya Devi Dasi', reason: 'No real change' }).expect(422);
    expect(same.body.errors[0]).toMatchObject({ path: 'spiritualName', code: 'UNCHANGED' });
    await s.admin.patch(`/register/${NIL}`, { spiritualName: 'New Das', reason: 'x' }).expect(404);
    await s.admin.patch('/register/not-a-uuid', { spiritualName: 'New Das', reason: 'x' }).expect(400);
    const [row] = await w.db.select().from(registerEntries).where(eq(registerEntries.id, id));
    expect(row!.spiritualName).toBe('Gaura Priya Devi Dasi');
    expect(await w.db.select().from(auditLog).where(and(eq(auditLog.tenantId, s.t.id), eq(auditLog.action, 'register.corrected')))).toHaveLength(0);
  });

  // ───────── writing, integrity ─────────

  it('writes entries with an audit line each, and refuses blank names and people already in the register', async () => {
    const { s, rows } = await fixture();
    const audited = await w.db.select().from(auditLog).where(and(eq(auditLog.tenantId, s.t.id), eq(auditLog.action, 'register.entry-created')));
    expect(audited).toHaveLength(5);
    expect(audited.map((a) => a.applicationId).sort()).toEqual(rows.map((r) => r.applicationId).sort());

    await expect(write(s, [rows[0]!])).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
    const fresh = await arrange(s, 'Fresh Person', s.guru1.id, 'FIRST', '2026-10-10');
    await expect(write(s, [{ ...fresh, spiritualName: '   ' }])).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    // A batch with one bad entry writes none of them.
    const another = await arrange(s, 'Another Person', s.guru1.id, 'FIRST', '2026-10-10');
    await expect(write(s, [{ ...another, spiritualName: 'Fine Das' }, rows[1]!])).rejects.toMatchObject({ status: 409 });
    expect(await w.db.select().from(registerEntries).where(eq(registerEntries.applicationId, another.applicationId))).toHaveLength(0);
    expect((await s.admin.get('/register').expect(200)).body.total).toBe(5);
  });

  it('cannot delete a register entry: the database refuses', async () => {
    const { s, created } = await fixture();
    const id = created[0]!.id;
    const attempt = await w.db.delete(registerEntries).where(eq(registerEntries.id, id)).then(
      () => null,
      (e: unknown) => e as { message?: string; cause?: { code?: string; message?: string } },
    );
    expect(attempt).not.toBeNull();
    const cause = attempt!.cause ?? attempt!;
    expect(cause.message).toMatch(/append-only|not allowed/);
    expect(await w.db.select().from(registerEntries).where(eq(registerEntries.id, id))).toHaveLength(1);
    expect((await s.admin.get('/register').expect(200)).body.total).toBe(5);
    // There is no HTTP route for it either.
    await s.admin.delete(`/register/${id}`).expect(404);
  });

  // ───────── the application file ─────────

  it('adds the entry to the timeline of the application file', async () => {
    const { s, created } = await fixture();
    const entry = created.find((e) => e.candidateName === 'Bimal Das')!;
    const timeline = (await s.committee.get(`/applications/${entry.applicationId}/timeline`).expect(200)).body as Array<{
      id: string;
      kind: string;
      summary: { code: string; params: Record<string, string> };
    }>;
    const line = timeline.filter((e) => e.kind === 'REGISTER');
    expect(line).toEqual([
      expect.objectContaining({ id: `register:${entry.id}`, summary: { code: 'timeline.register', params: { date: '2026-09-15', spiritualName: 'Bimal Krishna Das' } } }),
    ]);
    // A file without an entry has no such line.
    const other = await arrange(s, 'Not Yet', s.guru1.id, 'FIRST', '2026-10-10');
    const none = (await s.committee.get(`/applications/${other.applicationId}/timeline`).expect(200)).body as Array<{ kind: string }>;
    expect(none.some((e) => e.kind === 'REGISTER')).toBe(false);
  });

  // ───────── tenants ─────────

  it('keeps temples apart', async () => {
    const one = await fixture();
    const two = await setup();
    const id = one.created[0]!.id;
    expect((await two.admin.get('/register').expect(200)).body).toMatchObject({ total: 0, items: [] });
    expect((await two.admin.get('/register?q=Anita').expect(200)).body.total).toBe(0);
    expect((await two.admin.get('/register/export.csv').expect(200)).text.trim().split('\r\n')).toHaveLength(1);
    await two.admin.patch(`/register/${id}`, { spiritualName: 'Hijacked Das', reason: 'attack' }).expect(404);
    const [row] = await w.db.select().from(registerEntries).where(eq(registerEntries.id, id));
    expect(row!.spiritualName).toBe('Gaura Priya Devi Dasi');
    // A guru filter naming another temple's guru finds nothing.
    expect((await two.admin.get(`/register?guruId=${one.s.guru1.id}`).expect(200)).body.total).toBe(0);
  });
});
