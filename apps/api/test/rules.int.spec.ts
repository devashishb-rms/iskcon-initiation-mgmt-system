import { buildWorld, type TestWorld } from './helpers/test-app';

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

describe('gurus and rule sets (integration)', () => {
  let w: TestWorld;
  beforeAll(async () => {
    w = await buildWorld();
  });
  afterAll(() => w.close());

  async function setup() {
    const t = await w.newTenant();
    const admin = await w.newUser(t, { roles: ['ADMIN'] });
    const mentor = await w.newUser(t, { roles: ['MENTOR'] });
    const a = await w.signIn(t, admin);
    const m = await w.signIn(t, mentor);
    return { t, a, m };
  }

  it('creates the baseline at the GBC minimums on first read', async () => {
    const { a } = await setup();
    const res = await a.get('/rule-sets').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ isBaseline: true, current: { version: 1, status: 'PUBLISHED' } });
    expect(res.body[0].current.params).toMatchObject({ practiceMonths: 12, shelterMonths: 6 });
  });

  it('lets only an administrator edit rule sets', async () => {
    const { a, m } = await setup();
    await m.get('/rule-sets').expect(403);
    const sets = (await a.get('/rule-sets').expect(200)).body;
    await m.put(`/rule-sets/${sets[0].id}/draft`, { params: baseParams({ practiceMonths: 14 }) }).expect(403);
  });

  it('refuses values below the GBC floor on the baseline', async () => {
    const { a } = await setup();
    const sets = (await a.get('/rule-sets')).body;
    const res = await a.put(`/rule-sets/${sets[0].id}/draft`, { params: baseParams({ shelterMonths: 3, letterRequired: false }) }).expect(422);
    expect(res.body.code).toBe('RULE_BELOW_FLOOR');
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['letterRequired', 'shelterMonths']);
  });

  it('saves a draft, publishes it as the next version and keeps history', async () => {
    const { a } = await setup();
    const id = (await a.get('/rule-sets')).body[0].id;
    const draft = await a.put(`/rule-sets/${id}/draft`, { params: baseParams({ practiceMonths: 18 }), note: 'Longer practice' }).expect(200);
    expect(draft.body.draft).toMatchObject({ version: 2, status: 'DRAFT' });
    expect(draft.body.current.version).toBe(1);
    const pub = await a.post(`/rule-sets/${id}/publish`).expect(200);
    expect(pub.body.current).toMatchObject({ version: 2, status: 'PUBLISHED' });
    expect(pub.body.draft).toBeNull();
    expect(pub.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const audit = await a.get('/audit').expect(200);
    expect(JSON.stringify(audit.body)).toContain('ruleset.published');
  });

  it('refuses to publish without a draft and can discard one', async () => {
    const { a } = await setup();
    const id = (await a.get('/rule-sets')).body[0].id;
    expect((await a.post(`/rule-sets/${id}/publish`).expect(422)).body.code).toBe('RULESET_NO_DRAFT');
    await a.put(`/rule-sets/${id}/draft`, { params: baseParams({ practiceMonths: 13 }) }).expect(200);
    await a.delete(`/rule-sets/${id}/draft`).expect(204);
    expect((await a.get('/rule-sets')).body[0].draft).toBeNull();
  });

  it('holds a guru rule set to the temple baseline, not just the GBC floor', async () => {
    const { a } = await setup();
    const guru = (await a.post('/gurus', { name: 'HH Test Swami' }).expect(201)).body;
    const base = (await a.get('/rule-sets')).body[0];
    await a.put(`/rule-sets/${base.id}/draft`, { params: baseParams({ practiceMonths: 18 }) }).expect(200);
    await a.post(`/rule-sets/${base.id}/publish`).expect(200);
    const set = (await a.post('/rule-sets', { guruId: guru.id }).expect(201)).body;
    // Created as a draft copy of the baseline (18), so lowering to 12 is refused.
    expect(set.draft.params.practiceMonths).toBe(18);
    const res = await a.put(`/rule-sets/${set.id}/draft`, { params: baseParams({ practiceMonths: 12 }) }).expect(422);
    expect(res.body.code).toBe('RULE_BELOW_FLOOR');
    await a.post('/rule-sets', { guruId: guru.id }).expect(409);
  });

  it('keeps tenants apart', async () => {
    const one = await setup();
    const two = await setup();
    await one.a.post('/gurus', { name: 'HH Only Mine' }).expect(201);
    const names = (await two.a.get('/gurus').expect(200)).body.map((g: { name: string }) => g.name);
    expect(names).not.toContain('HH Only Mine');
    const idOfOne = (await one.a.get('/rule-sets')).body[0].id;
    await two.a.put(`/rule-sets/${idOfOne}/draft`, { params: baseParams() }).expect(404);
  });
});
