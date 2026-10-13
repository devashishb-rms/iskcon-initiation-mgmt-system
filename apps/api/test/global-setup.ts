import { runMigrations } from '../src/database/migrate';

export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5433/iskcon_test';
  await runMigrations(url);
}
