import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { authenticator } from 'otplib';
import supertest from 'supertest';
import type { Request } from 'express';
import type { Role } from '@iskcon/contracts';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { DB_POOL, DbService, UnitOfWork, type Database } from '../../src/database/database.module';
import { tenants, userRoles, users } from '../../src/database/schema';
import { Clock } from '../../src/platform/clock/clock';
import { ConsoleGateway } from '../../src/platform/delivery/gateways';
import { OutboxDispatcher } from '../../src/platform/events/outbox-dispatcher';
import { RequestContextService } from '../../src/platform/tenancy/request-context';
import { TenantDirectory, TenantResolver, type TenantRecord } from '../../src/platform/tenancy/tenancy.module';

/** A clock the test can move. */
export class TestClock extends Clock {
  private fixed: Date | null = null;
  set(iso: string): void {
    this.fixed = new Date(iso);
  }
  advanceMinutes(n: number): void {
    this.fixed = new Date(this.now().getTime() + n * 60_000);
  }
  reset(): void {
    this.fixed = null;
  }
  override now(): Date {
    return this.fixed ? new Date(this.fixed) : new Date();
  }
}

/** Picks the tenant from a test header, so one app can serve many temples in one test. */
class HeaderTenantResolver extends TenantResolver {
  constructor(private readonly directory: TenantDirectory) {
    super();
  }
  async resolve(req: Request): Promise<TenantRecord> {
    const slug = req.header('x-test-tenant') ?? 'default-test';
    const t = await this.directory.bySlug(slug);
    if (!t) throw new Error(`Test tenant ${slug} missing`);
    return t;
  }
}

export interface TestWorld {
  app: INestApplication;
  db: Database;
  clock: TestClock;
  mail: ConsoleGateway;
  dispatcher: OutboxDispatcher;
  ctx: RequestContextService;
  uow: UnitOfWork;
  dbService: DbService;
  /** Creates a fresh, isolated temple. Tests never share rows. */
  newTenant(name?: string): Promise<TenantRecord>;
  newUser(tenant: TenantRecord, opts: { name?: string; roles: Role[]; email?: string; phone?: string }): Promise<TestUser>;
  /** Signs a person in (including the second factor when their role needs it) and returns a client. */
  signIn(tenant: TenantRecord, user: TestUser): Promise<Client>;
  anonymous(tenant: TenantRecord): Client;
  /** Runs code as the system inside a tenant, for arranging data through services. */
  asSystem<T>(tenant: TenantRecord, fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface TestUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: Role[];
}

export class Client {
  constructor(
    private readonly http: ReturnType<typeof supertest>,
    private readonly tenantSlug: string,
    private cookie?: string,
  ) {}
  private apply(req: supertest.Test): supertest.Test {
    req.set('x-test-tenant', this.tenantSlug).set('x-requested-by', 'iskcon-web');
    if (this.cookie) req.set('cookie', this.cookie);
    return req;
  }
  get(url: string) {
    return this.apply(this.http.get(url));
  }
  post(url: string, body?: object) {
    return this.apply(this.http.post(url)).send(body ?? {});
  }
  put(url: string, body?: object) {
    return this.apply(this.http.put(url)).send(body ?? {});
  }
  patch(url: string, body?: object) {
    return this.apply(this.http.patch(url)).send(body ?? {});
  }
  delete(url: string) {
    return this.apply(this.http.delete(url));
  }
  /** For multipart uploads: returns the raw request so the test can attach a file. */
  raw(method: 'post' | 'put', url: string) {
    return this.apply(this.http[method](url));
  }
  withCookie(cookie: string): Client {
    this.cookie = cookie;
    return this;
  }
}

export async function buildWorld(): Promise<TestWorld> {
  const clock = new TestClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(TenantResolver)
    .useFactory({ factory: (d: TenantDirectory) => new HeaderTenantResolver(d), inject: [TenantDirectory] })
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const db = app.get<Database>(DB_POOL);
  const http = supertest(app.getHttpServer());
  const mail = app.get(ConsoleGateway);
  const ctx = app.get(RequestContextService);
  const directory = app.get(TenantDirectory);

  const world: TestWorld = {
    app,
    db,
    clock,
    mail,
    ctx,
    dispatcher: app.get(OutboxDispatcher),
    uow: app.get(UnitOfWork),
    dbService: app.get(DbService),
    async newTenant(name = 'Test Temple') {
      const slug = `t-${randomUUID().slice(0, 8)}`;
      const [row] = await db.insert(tenants).values({ slug, name }).returning();
      directory.clearCache();
      return row!;
    },
    async newUser(tenant, opts) {
      const id = randomUUID();
      const email = opts.email ?? `${id.slice(0, 8)}@example.org`;
      await db.insert(users).values({ id, tenantId: tenant.id, name: opts.name ?? 'Test Person', email, phone: opts.phone ?? null });
      await db.insert(userRoles).values(opts.roles.map((role) => ({ tenantId: tenant.id, userId: id, role })));
      return { id, name: opts.name ?? 'Test Person', email, phone: opts.phone ?? null, roles: opts.roles };
    },
    anonymous(tenant) {
      return new Client(http, tenant.slug);
    },
    async signIn(tenant, user) {
      const anon = new Client(http, tenant.slug);
      mail.clear();
      await anon.post('/auth/otp/request', { identifier: user.email }).expect(202);
      const code = /(\d{6}) is your sign-in code/.exec(mail.lastTo(user.email) ?? '')?.[1];
      if (!code) throw new Error('No sign-in code was sent');
      const res = await anon.post('/auth/otp/verify', { identifier: user.email, code }).expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
      const client = new Client(http, tenant.slug, cookie);
      if (res.body.mfa.required) {
        const enrol = await client.post('/auth/mfa/enrol').expect(201);
        await client.post('/auth/mfa/enrol/confirm', { code: authenticator.generate(enrol.body.secret) }).expect(200);
      }
      return client;
    },
    asSystem(tenant, fn) {
      return ctx.runAsSystem(tenant.id, fn);
    },
    async close() {
      await app.close();
    },
  };
  return world;
}
