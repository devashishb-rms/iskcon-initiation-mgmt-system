import { date, foreignKey, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, createdAtCol } from './_helpers';
import { trackEnum } from './enums';
import { applications } from './candidates';
import { ceremonies } from './ceremonies';
import { gurus } from './gurus';

/** Permanent record. Created only when a ceremony completes; never deleted (trigger in the migration). */
export const registerEntries = pgTable(
  'register_entries',
  {
    id: pk(),
    tenantId: tenantCol(),
    applicationId: uuid().notNull().unique(),
    candidateName: text().notNull(),
    spiritualName: text().notNull(),
    track: trackEnum().notNull(),
    guruId: uuid().notNull(),
    ceremonyId: uuid().notNull(),
    initiatedOn: date({ mode: 'string' }).notNull(),
    createdAt: createdAtCol(),
  },
  (t) => [
    index('register_initiated_idx').on(t.tenantId, t.initiatedOn),
    index('register_guru_idx').on(t.tenantId, t.guruId),
    foreignKey({ columns: [t.tenantId, t.applicationId], foreignColumns: [applications.tenantId, applications.id] }),
    foreignKey({ columns: [t.tenantId, t.guruId], foreignColumns: [gurus.tenantId, gurus.id] }),
    foreignKey({ columns: [t.tenantId, t.ceremonyId], foreignColumns: [ceremonies.tenantId, ceremonies.id] }),
  ],
);
