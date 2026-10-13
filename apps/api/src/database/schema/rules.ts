import { foreignKey, index, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, createdAtCol, tstz } from './_helpers';
import { ruleVersionStatusEnum } from './enums';
import { gurus } from './gurus';
import { users } from './identity';

/** guruId null = the tenant's GBC baseline; otherwise one guru's office. */
export const ruleSets = pgTable(
  'rule_sets',
  {
    id: pk(),
    tenantId: tenantCol(),
    guruId: uuid(),
    name: text().notNull(),
    createdAt: createdAtCol(),
  },
  (t) => [
    unique('rule_sets_tenant_id_uq').on(t.tenantId, t.id),
    // One rule set per guru per tenant. `nulls not distinct` also keeps a single baseline.
    unique('rule_sets_tenant_guru_uq').on(t.tenantId, t.guruId).nullsNotDistinct(),
    foreignKey({ columns: [t.tenantId, t.guruId], foreignColumns: [gurus.tenantId, gurus.id] }),
  ],
);

export const ruleSetVersions = pgTable(
  'rule_set_versions',
  {
    id: pk(),
    tenantId: tenantCol(),
    ruleSetId: uuid().notNull(),
    version: integer().notNull(),
    status: ruleVersionStatusEnum().notNull(),
    /** RuleParams from @iskcon/rules-engine, validated against the GBC floor before saving. */
    params: jsonb().notNull(),
    note: text(),
    createdById: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAtCol(),
    publishedAt: tstz(),
  },
  (t) => [
    unique('rule_set_versions_tenant_id_uq').on(t.tenantId, t.id),
    unique('rule_set_versions_set_version_uq').on(t.ruleSetId, t.version),
    index('rule_set_versions_lookup_idx').on(t.tenantId, t.ruleSetId, t.status),
    foreignKey({ columns: [t.tenantId, t.ruleSetId], foreignColumns: [ruleSets.tenantId, ruleSets.id] }),
  ],
);
