import type { INestApplicationContext } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Role } from '@iskcon/contracts';
import { addMonths } from '@iskcon/rules-engine';
import { DB_POOL, UnitOfWork, type Database } from '../database/database.module';
import { tenants } from '../database/schema';
import { Clock } from '../platform/clock/clock';
import { RequestContextService, type AuthUser } from '../platform/tenancy/request-context';
import { UsersService, type UserWithRoles } from '../modules/identity';

/** What a seed step gets: the running app, the temple being seeded, and helpers to act as a person. */
export interface SeedContext {
  app: INestApplicationContext;
  tenantId: string;
  today: string;
  /** Runs `fn` as the given person, inside one transaction, exactly as an API call would. */
  as<T>(user: Pick<UserWithRoles, 'id' | 'name' | 'roles'>, fn: () => Promise<T>): Promise<T>;
  /** Runs `fn` as the system (no person), inside one transaction. */
  asSystem<T>(fn: () => Promise<T>): Promise<T>;
  get<T>(token: new (...args: never[]) => T): T;
  /** A calendar date n months before today, for believable sample data. */
  monthsAgo(n: number): string;
  /** People already created by earlier steps, by short key (see core.seed.ts). */
  people: Record<string, UserWithRoles>;
  /** Anything a step wants later steps to find (ids of candidates, applications, gurus...). */
  shared: Record<string, string>;
}

/** A step of the sample-data load. Files named `*.seed.ts` in this folder are found automatically. */
export interface SeedStep {
  name: string;
  /** Lower runs first. core = 10, documents = 30, recommendations = 40, ceremonies = 50. */
  order: number;
  run(ctx: SeedContext): Promise<void>;
}

export async function buildContext(app: INestApplicationContext, slug: string, name: string): Promise<SeedContext> {
  const db = app.get<Database>(DB_POOL);
  await db.insert(tenants).values({ slug, name }).onConflictDoNothing();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  const ctx = app.get(RequestContextService);
  const uow = app.get(UnitOfWork);
  const clock = app.get(Clock);
  const base = { tenantId: tenant!.id, requestId: `seed-${Date.now()}` };
  const toAuth = (u: Pick<UserWithRoles, 'id' | 'name' | 'roles'>): AuthUser => ({
    id: u.id,
    name: u.name,
    roles: u.roles as Role[],
    locale: 'en',
    sessionId: 'seed',
    mfaVerified: true,
    mfaEnrolled: true,
  });
  return {
    app,
    tenantId: tenant!.id,
    today: clock.today(),
    as: (user, fn) => ctx.run({ ...base, user: toAuth(user) }, () => uow.run(fn)),
    asSystem: (fn) => ctx.run({ ...base, system: true }, () => uow.run(fn)),
    get: (token) => app.get(token as never),
    monthsAgo: (n) => addMonths(clock.today(), -n),
    people: {},
    shared: {},
  };
}

export type { UsersService };
