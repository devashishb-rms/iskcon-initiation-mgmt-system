import { authenticator } from 'otplib';
import { buildWorld, type TestWorld } from './helpers/test-app';

describe('sign-in and access (integration)', () => {
  let w: TestWorld;
  beforeAll(async () => {
    w = await buildWorld();
  });
  afterAll(() => w.close());
  afterEach(() => w.clock.reset());

  it('serves health checks without signing in', async () => {
    const t = await w.newTenant();
    await w.anonymous(t).get('/healthz').expect(200);
    await w.anonymous(t).get('/readyz').expect(200);
  });

  it('refuses unauthenticated calls with a problem body', async () => {
    const t = await w.newTenant();
    const res = await w.anonymous(t).get('/people').expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('refuses a state-changing call that lacks the CSRF header', async () => {
    const t = await w.newTenant();
    const supertest = (await import('supertest')).default;
    const res = await supertest(w.app.getHttpServer()).post('/auth/otp/request').set('x-test-tenant', t.slug).send({ identifier: 'a@b.org' });
    expect(res.status).toBe(403);
  });

  it('signs a mentor in with an emailed code and returns the session', async () => {
    const t = await w.newTenant();
    const u = await w.newUser(t, { name: 'Mohan Biswas', roles: ['MENTOR'] });
    const c = await w.signIn(t, u);
    const res = await c.get('/auth/session').expect(200);
    expect(res.body.user).toMatchObject({ name: 'Mohan Biswas', roles: ['MENTOR'] });
    expect(res.body.mfa).toEqual({ required: false, enrolled: false, verified: true });
  });

  it('answers 202 for an unknown identifier and sends nothing (no account enumeration)', async () => {
    const t = await w.newTenant();
    w.mail.clear();
    await w.anonymous(t).post('/auth/otp/request', { identifier: 'nobody@example.org' }).expect(202);
    expect(w.mail.sent).toHaveLength(0);
  });

  it('rejects a wrong code, then locks the code after too many attempts', async () => {
    const t = await w.newTenant();
    const u = await w.newUser(t, { roles: ['MENTOR'] });
    const anon = w.anonymous(t);
    w.mail.clear();
    await anon.post('/auth/otp/request', { identifier: u.email }).expect(202);
    const good = /(\d{6})/.exec(w.mail.lastTo(u.email)!)![1]!;
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await anon.post('/auth/otp/verify', { identifier: u.email, code: bad }).expect(401);
    }
    const res = await anon.post('/auth/otp/verify', { identifier: u.email, code: good }).expect(401);
    expect(res.body.code).toBe('OTP_INVALID');
  });

  it('rejects an expired code', async () => {
    const t = await w.newTenant();
    const u = await w.newUser(t, { roles: ['MENTOR'] });
    const anon = w.anonymous(t);
    w.mail.clear();
    await anon.post('/auth/otp/request', { identifier: u.email }).expect(202);
    const code = /(\d{6})/.exec(w.mail.lastTo(u.email)!)![1]!;
    w.clock.set(new Date(Date.now() + 11 * 60_000).toISOString());
    const res = await anon.post('/auth/otp/verify', { identifier: u.email, code }).expect(401);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('a code works once', async () => {
    const t = await w.newTenant();
    const u = await w.newUser(t, { roles: ['MENTOR'] });
    const anon = w.anonymous(t);
    w.mail.clear();
    await anon.post('/auth/otp/request', { identifier: u.email }).expect(202);
    const code = /(\d{6})/.exec(w.mail.lastTo(u.email)!)![1]!;
    await anon.post('/auth/otp/verify', { identifier: u.email, code }).expect(200);
    await anon.post('/auth/otp/verify', { identifier: u.email, code }).expect(401);
  });

  it('holds a president at the second factor until it is proven', async () => {
    const t = await w.newTenant();
    const u = await w.newUser(t, { roles: ['PRESIDENT'] });
    const anon = w.anonymous(t);
    w.mail.clear();
    await anon.post('/auth/otp/request', { identifier: u.email }).expect(202);
    const code = /(\d{6})/.exec(w.mail.lastTo(u.email)!)![1]!;
    const res = await anon.post('/auth/otp/verify', { identifier: u.email, code }).expect(200);
    expect(res.body.mfa).toEqual({ required: true, enrolled: false, verified: false });
    const cookie = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    const client = anon.withCookie(cookie);

    // Anything but the MFA routes is refused.
    const blocked = await client.get('/audit').expect(403);
    expect(blocked.body.code).toBe('MFA_REQUIRED');

    const enrol = await client.post('/auth/mfa/enrol').expect(201);
    await client.post('/auth/mfa/enrol/confirm', { code: '000000' }).expect(401);
    await client.post('/auth/mfa/enrol/confirm', { code: authenticator.generate(enrol.body.secret) }).expect(200);
    await client.get('/audit').expect(200);
  });

  it('asks an enrolled president for the code on a new sign-in', async () => {
    const t = await w.newTenant();
    const u = await w.newUser(t, { roles: ['PRESIDENT'] });
    const first = await w.signIn(t, u); // enrols
    const secretRow = await w.db.query.users.findFirst({ where: (x, { eq }) => eq(x.id, u.id) });
    expect(secretRow?.totpEnabledAt).not.toBeNull();
    await first.post('/auth/logout').expect(204);

    const anon = w.anonymous(t);
    w.mail.clear();
    await anon.post('/auth/otp/request', { identifier: u.email }).expect(202);
    const code = /(\d{6})/.exec(w.mail.lastTo(u.email)!)![1]!;
    const res = await anon.post('/auth/otp/verify', { identifier: u.email, code }).expect(200);
    expect(res.body.mfa).toEqual({ required: true, enrolled: true, verified: false });
  });

  it('forbids a role from a route it has no permission for', async () => {
    const t = await w.newTenant();
    const u = await w.newUser(t, { roles: ['MENTOR'] });
    const c = await w.signIn(t, u);
    const res = await c.get('/people').expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('does not accept a session from another temple', async () => {
    const a = await w.newTenant('A');
    const b = await w.newTenant('B');
    const u = await w.newUser(a, { roles: ['MENTOR'] });
    const client = await w.signIn(a, u);
    const cookieOfA = (client as unknown as { cookie: string }).cookie;
    const sneaky = w.anonymous(b).withCookie(cookieOfA);
    await sneaky.get('/auth/session').expect(401);
  });

  it('lets an administrator manage people, and revokes sessions when a person is deactivated', async () => {
    const t = await w.newTenant();
    const admin = await w.signIn(t, await w.newUser(t, { roles: ['ADMIN'] }));
    const created = await admin.post('/people', { name: 'Kalyan Dutta', email: 'kalyan@example.org', roles: ['MENTOR'] }).expect(201);
    expect(created.body).toMatchObject({ name: 'Kalyan Dutta', roles: ['MENTOR'], active: true });
    await admin.post('/people', { name: 'Dup', email: 'kalyan@example.org', roles: ['MENTOR'] }).expect(409);

    const mentorUser = { id: created.body.id, name: 'Kalyan Dutta', email: 'kalyan@example.org', phone: null, roles: ['MENTOR' as const] };
    const mentor = await w.signIn(t, mentorUser);
    await mentor.get('/auth/session').expect(200);
    await admin.patch(`/people/${created.body.id}`, { active: false }).expect(200);
    await mentor.get('/auth/session').expect(401);

    const list = await admin.get('/people').expect(200);
    expect(list.body.map((p: { name: string }) => p.name)).toContain('Kalyan Dutta');
  });

  it('writes sign-in and person changes to the audit log', async () => {
    const t = await w.newTenant();
    const admin = await w.signIn(t, await w.newUser(t, { roles: ['ADMIN'] }));
    await admin.post('/people', { name: 'Audit Me', phone: '98300 12345', roles: ['COMMITTEE'] }).expect(201);
    const log = await admin.get('/audit').expect(200);
    const actions = log.body.items.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.sign-in', 'person.created', 'auth.mfa-enrolled']));
  });
});
