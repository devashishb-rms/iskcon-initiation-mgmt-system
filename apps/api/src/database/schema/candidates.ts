import {
  boolean,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { pk, tenantCol, createdAtCol, tstz } from './_helpers';
import {
  applicationStatusEnum,
  examStatusEnum,
  noteKindEnum,
  stageEnum,
  trackEnum,
} from './enums';
import { gurus } from './gurus';
import { users } from './identity';

/** Personal details live here and on `users` only (NFR-1). */
export const candidates = pgTable(
  'candidates',
  {
    id: pk(),
    tenantId: tenantCol(),
    userId: uuid().unique().references(() => users.id),
    name: text().notNull(),
    phone: text(),
    email: text(),
    /** Bhakti vriksha or sanga group. */
    groupName: text(),
    mentorId: uuid().references(() => users.id),
    consentAt: tstz().notNull(),
    consentVersion: text().notNull(),
    active: boolean().notNull().default(true),
    createdAt: createdAtCol(),
    updatedAt: createdAtCol(),
  },
  (t) => [
    unique('candidates_tenant_id_uq').on(t.tenantId, t.id),
    index('candidates_mentor_idx').on(t.tenantId, t.mentorId),
    index('candidates_name_idx').on(t.tenantId, t.name),
  ],
);

/**
 * One initiation attempt, first or second: the hub that documents, notes, exceptions, the
 * recommendation and the register entry attach to.
 */
export const applications = pgTable(
  'applications',
  {
    id: pk(),
    tenantId: tenantCol(),
    candidateId: uuid().notNull(),
    track: trackEnum().notNull(),
    stage: stageEnum().notNull().default('ASPIRING'),
    stageSince: createdAtCol(),
    status: applicationStatusEnum().notNull().default('OPEN'),
    guruId: uuid(),
    // Facts the rule engine reads. Calendar dates are strings (YYYY-MM-DD), never instants.
    practiceSince: date({ mode: 'string' }),
    shelterDate: date({ mode: 'string' }),
    examStatus: examStatusEnum(),
    courseComplete: boolean(),
    firstInitiationDate: date({ mode: 'string' }),
    guruChangedOn: date({ mode: 'string' }),
    returnedOn: date({ mode: 'string' }),
    createdAt: createdAtCol(),
    updatedAt: createdAtCol(),
    closedAt: tstz(),
  },
  (t) => [
    unique('applications_tenant_id_uq').on(t.tenantId, t.id),
    index('applications_stage_idx').on(t.tenantId, t.stage, t.status),
    index('applications_candidate_idx').on(t.tenantId, t.candidateId),
    index('applications_guru_idx').on(t.tenantId, t.guruId),
    foreignKey({ columns: [t.tenantId, t.candidateId], foreignColumns: [candidates.tenantId, candidates.id] }),
    foreignKey({ columns: [t.tenantId, t.guruId], foreignColumns: [gurus.tenantId, gurus.id] }),
  ],
);

export const applicationStageEvents = pgTable(
  'application_stage_events',
  {
    id: pk(),
    tenantId: tenantCol(),
    applicationId: uuid().notNull(),
    fromStage: stageEnum(),
    toStage: stageEnum().notNull(),
    actorId: uuid().references(() => users.id),
    reason: text(),
    at: createdAtCol(),
  },
  (t) => [
    index('stage_events_app_idx').on(t.tenantId, t.applicationId, t.at),
    foreignKey({ columns: [t.tenantId, t.applicationId], foreignColumns: [applications.tenantId, applications.id] }),
  ],
);

export const notes = pgTable(
  'notes',
  {
    id: pk(),
    tenantId: tenantCol(),
    applicationId: uuid().notNull(),
    kind: noteKindEnum().notNull(),
    body: text().notNull(),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAtCol(),
  },
  (t) => [
    index('notes_app_idx').on(t.tenantId, t.applicationId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.applicationId], foreignColumns: [applications.tenantId, applications.id] }),
  ],
);
