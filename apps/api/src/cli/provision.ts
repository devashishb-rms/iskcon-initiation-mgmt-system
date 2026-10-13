import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { AppModule } from '../app.module';
import { parseEnv } from '../config/env';
import { DB_POOL, UnitOfWork, type Database } from '../database/database.module';
import { tenants } from '../database/schema';
import { UsersService } from '../modules/identity';
import { RuleSetsService } from '../modules/rules';
import { RequestContextService } from '../platform/tenancy/request-context';

/**
 * First-time setup of a real temple, with no sample data:
 *
 *   node dist/cli/provision.js --name "ISKCON Newtown" --admin-name "Full Name" --admin-email a@b.org [--admin-phone +91...]
 *
 * It creates the temple (slug from DEFAULT_TENANT_SLUG), its first administrator and the temple's
 * baseline rule set at the GBC minimums. Safe to run again: existing records are left as they are.
 * The administrator then signs in with a one-time code and enrols an authenticator app.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const env = parseEnv();
  const name = arg('name');
  const adminName = arg('admin-name');
  const adminEmail = arg('admin-email')?.toLowerCase();
  const adminPhone = arg('admin-phone');
  if (!name || !adminName || !adminEmail) {
    console.error('Usage: provision --name "Temple name" --admin-name "Full name" --admin-email address [--admin-phone +91...]');
    process.exit(2);
  }
  process.env.OUTBOX_ENABLED = 'false';
  process.env.SCHEDULER_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get<Database>(DB_POOL);
    await db.insert(tenants).values({ slug: env.DEFAULT_TENANT_SLUG, name }).onConflictDoNothing();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, env.DEFAULT_TENANT_SLUG));
    const ctx = app.get(RequestContextService);
    const uow = app.get(UnitOfWork);
    const users = app.get(UsersService);
    const rules = app.get(RuleSetsService);
    const asSystem = <T>(fn: () => Promise<T>) =>
      ctx.run({ tenantId: tenant!.id, requestId: `provision-${Date.now()}`, system: true }, () => uow.run(fn));

    let admin = await asSystem(() => users.findByContact('email', adminEmail));
    if (!admin) {
      admin = await asSystem(() => users.create({ name: adminName, email: adminEmail, phone: adminPhone, roles: ['ADMIN'] }));
      console.log(`Created administrator ${adminEmail}`);
    } else {
      console.log(`Administrator ${adminEmail} already exists`);
    }
    await asSystem(() => rules.ensureBaseline());
    console.log(`Temple "${tenant!.name}" (${tenant!.slug}) is ready. Sign in as ${adminEmail}; a one-time code is sent by email.`);
    console.log('Next: add gurus, set each guru office\'s rules, add the president, committee and mentors (People), then import candidates.');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
