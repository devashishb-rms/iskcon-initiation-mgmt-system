import { and, eq } from 'drizzle-orm';
import { users } from '../src/database/schema';
import { buildWorld, type TestUser, type TestWorld } from './helpers/test-app';

const consent = { accepted: true, version: '2026-10-draft-1' };

describe('candidates, facts and stages (integration)', () => {
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

  async function setup() {
    const t = await w.newTenant();
    const mentorU = await w.newUser(t, { name: 'Mohan Biswas', roles: ['MENTOR'] });
    const otherMentorU = await w.newUser(t, { name: 'Other Mentor', roles: ['MENTOR'] });
    const committeeU = await w.newUser(t, { name: 'Committee', roles: ['COMMITTEE'] });
    const presidentU = await w.newUser(t, { name: 'President', roles: ['PRESIDENT'] });
    const adminU = await w.newUser(t, { name: 'Admin', roles: ['ADMIN'] });
    const [mentor, otherMentor, committee, president, admin] = await Promise.all(
      [mentorU, otherMentorU, committeeU, presidentU, adminU].map((u) => w.signIn(t, u)),
    );
    const guru = (await admin!.post('/gurus', { name: 'HH Test Swami' }).expect(201)).body;
    return { t, mentorU, mentor: mentor!, otherMentor: otherMentor!, committee: committee!, president: president!, admin: admin!, guru };
  }

  async function addCandidate(s: Awaited<ReturnType<typeof setup>>, over: object = {}) {
    const res = await s.committee
      .post('/candidates', { name: 'Ananya Sen', email: `ananya-${Math.random().toString(36).slice(2, 8)}@example.org`, mentorId: s.mentorU.id, consent, ...over })
      .expect(201);
    return res.body as { candidateId: string; applicationId: string };
  }

  it('adds a candidate with consent and a login, at the first stage with unknowns not failures', async () => {
    const s = await setup();
    const { applicationId } = await addCandidate(s);
    const d = (await s.committee.get(`/applications/${applicationId}`).expect(200)).body;
    expect(d).toMatchObject({ stage: 'ASPIRING', status: 'OPEN', track: 'FIRST', candidate: { name: 'Ananya Sen' } });
    expect(d.evaluation.worst).toBe('UNKNOWN');
    expect(d.evaluation.canApprove).toBe(false);
    expect(d.actions).toMatchObject({ canAdvance: true, canSetTempleFacts: true, canSetPractice: false, canDecide: false });
  });

  it('refuses a candidate without the current consent version', async () => {
    const s = await setup();
    const res = await s.committee.post('/candidates', { name: 'No Consent', email: 'x@example.org', consent: { accepted: true, version: 'old' } }).expect(400);
    expect(res.body.errors[0]).toMatchObject({ path: 'consent.version', code: 'CONSENT_REQUIRED' });
    await s.mentor.post('/candidates', { name: 'By Mentor', email: 'y@example.org', consent }).expect(403);
  });

  it('shows each person only what they may see', async () => {
    const s = await setup();
    const a = await addCandidate(s, { name: 'First Person', email: 'first@example.org' });
    const b = await addCandidate(s, { name: 'Second Person', email: 'second@example.org', mentorId: undefined });
    // The assigned mentor sees only their own candidate.
    expect((await s.mentor.get('/candidates').expect(200)).body.items.map((i: { name: string }) => i.name)).toEqual(['First Person']);
    await s.mentor.get(`/applications/${b.applicationId}`).expect(404);
    await s.otherMentor.get(`/applications/${a.applicationId}`).expect(404);
    expect((await s.committee.get('/candidates').expect(200)).body.total).toBe(2);
    // A candidate sees only their own path.
    const cand: TestUser = { id: '', name: 'First Person', email: 'first@example.org', phone: null, roles: ['CANDIDATE'] };
    cand.id = await userIdByEmail(s.t.id, 'first@example.org');
    const me = await w.signIn(s.t, cand);
    const mine = (await me.get('/me/path').expect(200)).body;
    expect(mine.applicationId).toBe(a.applicationId);
    await me.get(`/applications/${b.applicationId}`).expect(404);
    await me.get('/candidates/export.csv').expect(403);
  });

  it('checks each fact against its own permission and refuses future dates', async () => {
    const s = await setup();
    const { applicationId } = await addCandidate(s);
    // The mentor may confirm practice, not temple facts.
    await s.mentor.patch(`/applications/${applicationId}/facts`, { practiceSince: '2024-01-10' }).expect(200);
    const denied = await s.mentor.patch(`/applications/${applicationId}/facts`, { courseComplete: true }).expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    await s.committee.patch(`/applications/${applicationId}/facts`, { practiceSince: '2024-01-10' }).expect(403);
    const future = await s.committee.patch(`/applications/${applicationId}/facts`, { shelterDate: '2027-01-01' }).expect(400);
    expect(future.body.errors[0].code).toBe('DATE_IN_FUTURE');
    const ok = (await s.committee.patch(`/applications/${applicationId}/facts`, { courseComplete: true, examStatus: 'PASSED' }).expect(200)).body;
    expect(ok.facts).toMatchObject({ practiceSince: '2024-01-10', courseComplete: true, examStatus: 'PASSED' });
    const r1 = ok.evaluation.items.find((i: { id: string }) => i.id === 'R-1');
    expect(r1.status).toBe('MET');
  });

  it('walks the early stages, needs a guru to submit, and only the own mentor can submit', async () => {
    const s = await setup();
    const { applicationId } = await addCandidate(s);
    const p = `/applications/${applicationId}`;
    // Cannot skip ahead or move without a shelter date.
    expect((await s.committee.post(`${p}/advance`, { to: 'PREPARING' }).expect(422)).body.code).toBe('INVALID_STAGE_TRANSITION');
    expect((await s.committee.post(`${p}/advance`, { to: 'SHELTER' }).expect(400)).body.errors[0].code).toBe('SHELTER_DATE_REQUIRED');
    const sh = (await s.committee.post(`${p}/advance`, { to: 'SHELTER', shelterDate: '2025-03-01' }).expect(201)).body;
    expect(sh).toMatchObject({ stage: 'SHELTER', facts: { shelterDate: '2025-03-01' } });
    await s.committee.post(`${p}/advance`, { to: 'PREPARING' }).expect(201);

    // No guru yet.
    const noGuru = await s.mentor.post(`${p}/submit`, { readinessNote: 'Ready.' }).expect(400);
    expect(noGuru.body.errors[0].code).toBe('GURU_REQUIRED');
    await s.committee.patch(`${p}/guru`, { guruId: s.guru.id }).expect(200);
    await s.otherMentor.post(`${p}/submit`, { readinessNote: 'Not mine' }).expect(404);
    const submitted = (await s.mentor.post(`${p}/submit`, { readinessNote: 'Regular, sincere, ready.' }).expect(201)).body;
    expect(submitted).toMatchObject({ stage: 'APPLIED', status: 'OPEN' });
    // Once with the president the guru is frozen and the file appears in the queue.
    await s.committee.patch(`${p}/guru`, { guruId: null }).expect(409);
    const q = (await s.president.get('/review-queue').expect(200)).body;
    expect(q.items).toHaveLength(1);
    expect(q.items[0]).toMatchObject({ applicationId, canApprove: false, ruleVersionLabel: expect.stringContaining('v1') });
    await s.mentor.get('/review-queue').expect(403);

    const timeline = (await s.committee.get(`${p}/timeline`).expect(200)).body;
    const stageTargets = timeline.filter((e: { kind: string }) => e.kind === 'STAGE').map((e: { summary: { params: { to: string } } }) => e.summary.params.to);
    expect(stageTargets).toEqual(['ASPIRING', 'SHELTER', 'PREPARING', 'APPLIED']);
  });

  it('hides the mentor\'s private notes from the candidate', async () => {
    const s = await setup();
    const { applicationId } = await addCandidate(s, { email: 'priv@example.org' });
    await s.mentor.post(`/applications/${applicationId}/notes`, { kind: 'MONTHLY', body: 'Private observation.' }).expect(201);
    await s.committee.post(`/applications/${applicationId}/notes`, { kind: 'MONTHLY', body: 'x' }).expect(403);
    const id = await userIdByEmail(s.t.id, 'priv@example.org');
    const me = await w.signIn(s.t, { id, name: 'Ananya Sen', email: 'priv@example.org', phone: null, roles: ['CANDIDATE'] });
    await me.post(`/applications/${applicationId}/notes`, { kind: 'MESSAGE', body: 'Hare Krishna, a question.' }).expect(201);
    const visible = (await me.get(`/applications/${applicationId}/notes`).expect(200)).body;
    expect(visible.map((n: { kind: string }) => n.kind)).toEqual(['MESSAGE']);
    expect((await s.mentor.get(`/applications/${applicationId}/notes`)).body).toHaveLength(2);
  });

  it('lets a mentor filter to the people waiting on them', async () => {
    const s = await setup();
    await addCandidate(s, { name: 'Needs Mentor', email: 'nm@example.org' });
    const res = await s.mentor.get('/candidates?waitingOnMentor=true').expect(200);
    expect(res.body.items.map((i: { name: string }) => i.name)).toEqual(['Needs Mentor']);
  });

  it('exports the list as CSV that cannot run formulas', async () => {
    const s = await setup();
    await addCandidate(s, { name: '=HYPERLINK("http://evil")', email: 'csv@example.org' });
    const res = await s.committee.get('/candidates/export.csv').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('keeps temples apart', async () => {
    const one = await setup();
    const two = await setup();
    const { applicationId } = await addCandidate(one);
    await two.committee.get(`/applications/${applicationId}`).expect(404);
    expect((await two.committee.get('/candidates')).body.total).toBe(0);
  });
});
