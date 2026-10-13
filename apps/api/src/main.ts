import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { parseEnv } from './config/env';
import { runMigrations } from './database/migrate';

async function main(): Promise<void> {
  const env = parseEnv();
  if (env.RUN_MIGRATIONS_ON_BOOT) await runMigrations(env.DATABASE_URL);
  const app = await createApp();
  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on :${env.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
