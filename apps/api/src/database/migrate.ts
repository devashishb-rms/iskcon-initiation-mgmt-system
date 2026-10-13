import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { join } from 'node:path';

/** Applies every pending SQL migration. Safe to run on every deploy (idempotent). */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool, { casing: 'snake_case' }), {
      migrationsFolder: join(__dirname, '..', '..', 'drizzle'),
    });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  runMigrations(url).then(
    () => console.log('migrations applied'),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
