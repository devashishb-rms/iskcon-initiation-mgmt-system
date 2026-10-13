import { boolean, date, foreignKey, index, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, createdAtCol } from './_helpers';
import { ceremonyStatusEnum, trackEnum } from './enums';
import { applications } from './candidates';
import { gurus } from './gurus';

export const ceremonies = pgTable(
  'ceremonies',
  {
    id: pk(),
    tenantId: tenantCol(),
    guruId: uuid().notNull(),
    track: trackEnum().notNull(),
    venue: text().notNull(),
    date: date({ mode: 'string' }).notNull(),
    status: ceremonyStatusEnum().notNull().default('PLANNED'),
    createdAt: createdAtCol(),
  },
  (t) => [
    unique('ceremonies_tenant_id_uq').on(t.tenantId, t.id),
    index('ceremonies_date_idx').on(t.tenantId, t.date),
    foreignKey({ columns: [t.tenantId, t.guruId], foreignColumns: [gurus.tenantId, gurus.id] }),
  ],
);

export const ceremonyAttendees = pgTable(
  'ceremony_attendees',
  {
    tenantId: tenantCol(),
    ceremonyId: uuid().notNull(),
    applicationId: uuid().notNull(),
    present: boolean().notNull().default(false),
    spiritualName: text(),
  },
  (t) => [
    primaryKey({ columns: [t.ceremonyId, t.applicationId] }),
    index('ceremony_attendees_app_idx').on(t.tenantId, t.applicationId),
    foreignKey({ columns: [t.tenantId, t.ceremonyId], foreignColumns: [ceremonies.tenantId, ceremonies.id] }),
    foreignKey({ columns: [t.tenantId, t.applicationId], foreignColumns: [applications.tenantId, applications.id] }),
  ],
);
