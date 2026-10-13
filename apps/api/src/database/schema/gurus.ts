import { boolean, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { pk, tenantCol, createdAtCol } from './_helpers';

export const gurus = pgTable(
  'gurus',
  {
    id: pk(),
    tenantId: tenantCol(),
    name: text().notNull(),
    active: boolean().notNull().default(true),
    createdAt: createdAtCol(),
  },
  (t) => [unique('gurus_tenant_id_uq').on(t.tenantId, t.id), unique('gurus_tenant_name_uq').on(t.tenantId, t.name)],
);
