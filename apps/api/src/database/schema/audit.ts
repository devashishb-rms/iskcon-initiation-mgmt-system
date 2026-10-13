import { bigserial, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAtCol, tenantCol } from './_helpers';

/** Append-only. UPDATE and DELETE are rejected by a trigger (NFR-6). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    tenantId: tenantCol(),
    at: createdAtCol(),
    actorId: uuid(),
    actorName: text().notNull(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    applicationId: uuid(),
    ruleSetVersionId: uuid(),
    detail: jsonb(),
    requestId: text(),
  },
  (t) => [
    index('audit_app_idx').on(t.tenantId, t.applicationId, t.at),
    index('audit_at_idx').on(t.tenantId, t.at),
  ],
);
