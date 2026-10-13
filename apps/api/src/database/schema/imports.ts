import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, createdAtCol, tstz } from './_helpers';
import { importStatusEnum } from './enums';
import { users } from './identity';

export const importJobs = pgTable(
  'import_jobs',
  {
    id: pk(),
    tenantId: tenantCol(),
    filename: text().notNull(),
    status: importStatusEnum().notNull(),
    /** Parsed, validated rows kept between preview and commit so the file is not read twice. */
    rows: jsonb().notNull(),
    summary: jsonb().notNull(),
    createdById: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAtCol(),
    committedAt: tstz(),
  },
  (t) => [index('import_jobs_idx').on(t.tenantId, t.createdAt)],
);
