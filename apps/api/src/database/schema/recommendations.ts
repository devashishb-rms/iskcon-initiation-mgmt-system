import { foreignKey, index, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, createdAtCol } from './_helpers';
import { decisionEnum, guruResponseEnum } from './enums';
import { applications } from './candidates';
import { users } from './identity';
import { ruleSetVersions } from './rules';

export const ruleExceptions = pgTable(
  'rule_exceptions',
  {
    id: pk(),
    tenantId: tenantCol(),
    applicationId: uuid().notNull(),
    ruleId: text().notNull(),
    reason: text().notNull(),
    createdById: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAtCol(),
  },
  (t) => [
    unique('rule_exceptions_app_rule_uq').on(t.applicationId, t.ruleId),
    index('rule_exceptions_app_idx').on(t.tenantId, t.applicationId),
    foreignKey({ columns: [t.tenantId, t.applicationId], foreignColumns: [applications.tenantId, applications.id] }),
  ],
);

export const recommendations = pgTable(
  'recommendations',
  {
    id: pk(),
    tenantId: tenantCol(),
    applicationId: uuid().notNull(),
    decision: decisionEnum().notNull(),
    reason: text(),
    decidedById: uuid()
      .notNull()
      .references(() => users.id),
    /** The rule set version the checklist ran against on the day (NFR-6). */
    ruleSetVersionId: uuid().notNull(),
    /** Resolved parameters and checklist at decision time, so history never changes when rules do. */
    evaluationSnapshot: jsonb().notNull(),
    createdAt: createdAtCol(),
  },
  (t) => [
    index('recommendations_app_idx').on(t.tenantId, t.applicationId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.applicationId], foreignColumns: [applications.tenantId, applications.id] }),
    foreignKey({ columns: [t.tenantId, t.ruleSetVersionId], foreignColumns: [ruleSetVersions.tenantId, ruleSetVersions.id] }),
  ],
);

export const guruResponses = pgTable(
  'guru_responses',
  {
    id: pk(),
    tenantId: tenantCol(),
    applicationId: uuid().notNull(),
    response: guruResponseEnum().notNull(),
    reason: text(),
    recordedById: uuid()
      .notNull()
      .references(() => users.id),
    recordedAt: createdAtCol(),
  },
  (t) => [
    index('guru_responses_app_idx').on(t.tenantId, t.applicationId, t.recordedAt),
    foreignKey({ columns: [t.tenantId, t.applicationId], foreignColumns: [applications.tenantId, applications.id] }),
  ],
);

export const packageExports = pgTable(
  'package_exports',
  {
    id: pk(),
    tenantId: tenantCol(),
    applicationId: uuid().notNull(),
    missingDocuments: jsonb().notNull(),
    exportedById: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAtCol(),
  },
  (t) => [
    index('package_exports_app_idx').on(t.tenantId, t.applicationId),
    foreignKey({ columns: [t.tenantId, t.applicationId], foreignColumns: [applications.tenantId, applications.id] }),
  ],
);
