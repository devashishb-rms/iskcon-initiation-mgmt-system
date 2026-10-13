import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './../app.module';
import { parseEnv } from '../config/env';
import { runMigrations } from '../database/migrate';
import { buildContext, type SeedStep } from './seed-kit';

/**
 * Loads sample data for one temple. Safe to run again: each step skips what already exists.
 * Never run against a real temple's database (it refuses when NODE_ENV=production unless forced).
 */
async function main(): Promise<void> {
  const env = parseEnv();
  if (env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'yes') {
    throw new Error('Refusing to load sample data in production. Set SEED_FORCE=yes if you really mean it.');
  }
  await runMigrations(env.DATABASE_URL);
  process.env.OUTBOX_ENABLED = 'false';
  process.env.SCHEDULER_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const files = readdirSync(__dirname).filter((f) => /\.seed\.(ts|js)$/.test(f));
    const steps: SeedStep[] = [];
    for (const f of files) steps.push((await import(join(__dirname, f))).default as SeedStep);
    steps.sort((a, b) => a.order - b.order);
    const ctx = await buildContext(app, env.DEFAULT_TENANT_SLUG, 'ISKCON Newtown (sample)');
    for (const s of steps) {
      console.log(`seed: ${s.name}`);
      await s.run(ctx);
    }
    console.log('seed: done');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
