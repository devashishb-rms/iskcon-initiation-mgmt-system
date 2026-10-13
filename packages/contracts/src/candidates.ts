import { z } from 'zod';
import { isoDate, isoDateTime, optionalText, pageQuery, text } from './common';
import { applicationStatus, documentType, examStatus, noteKind, stage, track } from './enums';
import { evaluationDto, nextStepDto, ruleVersionRef } from './checklist';

export const CONSENT_VERSION = '2026-10-draft-1';

export const createCandidateBody = z
  .object({
    name: text(120),
    phone: z.string().trim().max(30).optional(),
    email: z.string().trim().toLowerCase().email().max(160).optional(),
    groupName: optionalText(120),
    mentorId: z.string().uuid().optional(),
    guruId: z.string().uuid().optional(),
    track: track.default('FIRST'),
    /** The candidate saw what is stored and why, and agreed (NFR-3). */
    consent: z.object({ accepted: z.literal(true), version: z.string() }),
    /** Optional: create a login for the candidate so they can see their own path. */
    createLogin: z.boolean().default(true),
  })
  .refine((v) => !v.createLogin || v.phone || v.email, {
    message: 'LOGIN_NEEDS_CONTACT',
    path: ['phone'],
  });
export type CreateCandidateBody = z.infer<typeof createCandidateBody>;

export const candidateListQuery = pageQuery.extend({
  q: z.string().trim().max(80).optional(),
  stage: stage.optional(),
  status: applicationStatus.optional(),
  track: track.optional(),
  mentorId: z.string().uuid().optional(),
  guruId: z.string().uuid().optional(),
  /** Mentor view: only those whose next step is the mentor's. */
  waitingOnMentor: z.coerce.boolean().optional(),
});
export type CandidateListQuery = z.infer<typeof candidateListQuery>;

export const candidateListItem = z.object({
  candidateId: z.string().uuid(),
  applicationId: z.string().uuid(),
  name: z.string(),
  groupName: z.string().nullable(),
  track,
  stage,
  stageSince: isoDateTime,
  status: applicationStatus,
  mentor: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  guru: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  checklist: z.object({
    met: z.number().int(),
    total: z.number().int(),
    worst: z.enum(['MET', 'UNKNOWN', 'NOT_MET']),
  }),
  nextStep: nextStepDto,
});
export type CandidateListItem = z.infer<typeof candidateListItem>;

/** Facts the rule engine reads. Each field has its own permission (see application facts table). */
export const updateFactsBody = z
  .object({
    practiceSince: isoDate.nullable(),
    shelterDate: isoDate.nullable(),
    examStatus: examStatus.nullable(),
    courseComplete: z.boolean().nullable(),
    firstInitiationDate: isoDate.nullable(),
    guruChangedOn: isoDate.nullable(),
    returnedOn: isoDate.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'NOTHING_TO_UPDATE' });
export type UpdateFactsBody = z.infer<typeof updateFactsBody>;

export const changeGuruBody = z.object({ guruId: z.string().uuid().nullable() });
export const advanceBody = z.object({
  to: z.enum(['SHELTER', 'PREPARING']),
  /** Moving to SHELTER records the date the guru accepted the candidate in shelter (starts R-2). */
  shelterDate: isoDate.optional(),
  reason: optionalText(500),
});
export const submitApplicationBody = z.object({ readinessNote: text(4000) });
export const createSecondApplicationBody = z.object({ guruId: z.string().uuid().optional() });

export const noteDto = z.object({
  id: z.string().uuid(),
  kind: noteKind,
  body: z.string(),
  author: z.object({ id: z.string().uuid(), name: z.string() }),
  createdAt: isoDateTime,
});
export type NoteDto = z.infer<typeof noteDto>;
export const createNoteBody = z.object({ kind: z.enum(['MONTHLY', 'MESSAGE']), body: text(4000) });

export const timelineEvent = z.object({
  id: z.string(),
  at: isoDateTime,
  kind: z.enum(['STAGE', 'DOCUMENT', 'NOTE', 'EXCEPTION', 'RECOMMENDATION', 'GURU_RESPONSE', 'PACKAGE', 'FACT', 'REGISTER']),
  actor: z.string().nullable(),
  summary: z.object({ code: z.string(), params: z.record(z.union([z.string(), z.number()])).optional() }),
  ruleSetVersionId: z.string().uuid().nullable().optional(),
});
export type TimelineEvent = z.infer<typeof timelineEvent>;

export const documentDto = z.object({
  id: z.string().uuid(),
  type: documentType,
  filename: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  uploadedBy: z.string(),
  uploadedAt: isoDateTime,
});
export type DocumentDto = z.infer<typeof documentDto>;

export const exceptionDto = z.object({
  ruleId: z.string(),
  reason: z.string(),
  recordedBy: z.string(),
  recordedAt: isoDateTime,
});
export type ExceptionDto = z.infer<typeof exceptionDto>;

export const recommendationDto = z.object({
  id: z.string().uuid(),
  decision: z.enum(['APPROVE', 'SEND_BACK', 'DECLINE']),
  reason: z.string().nullable(),
  decidedBy: z.string(),
  decidedAt: isoDateTime,
  ruleVersion: ruleVersionRef,
});
export type RecommendationDto = z.infer<typeof recommendationDto>;

export const guruResponseDto = z.object({
  id: z.string().uuid(),
  response: z.enum(['ACCEPTED', 'WAIT', 'DECLINED']),
  reason: z.string().nullable(),
  recordedBy: z.string(),
  recordedAt: isoDateTime,
});
export type GuruResponseDto = z.infer<typeof guruResponseDto>;

/** The actions this caller may take on this application right now, so the UI never guesses. */
export const applicationActions = z.object({
  canSetPractice: z.boolean(),
  canSetTempleFacts: z.boolean(),
  canAdvance: z.boolean(),
  canSubmit: z.boolean(),
  canChangeGuru: z.boolean(),
  canRecordException: z.boolean(),
  canDecide: z.boolean(),
  canRecordGuruResponse: z.boolean(),
  canExportPackage: z.boolean(),
  canUpload: z.boolean(),
  canAddMonthlyNote: z.boolean(),
  canMessage: z.boolean(),
  /** When approval is not possible, why (rule ids), so the screen can explain it. */
  approveBlockedBy: z.array(z.string()),
});
export type ApplicationActions = z.infer<typeof applicationActions>;

export const applicationDetail = z.object({
  applicationId: z.string().uuid(),
  candidate: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    groupName: z.string().nullable(),
    consentAt: isoDateTime,
    otherApplications: z.array(z.object({ applicationId: z.string().uuid(), track, stage, status: applicationStatus })),
  }),
  track,
  stage,
  stageSince: isoDateTime,
  status: applicationStatus,
  mentor: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  guru: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  facts: z.object({
    practiceSince: isoDate.nullable(),
    shelterDate: isoDate.nullable(),
    examStatus: examStatus.nullable(),
    courseComplete: z.boolean().nullable(),
    firstInitiationDate: isoDate.nullable(),
    guruChangedOn: isoDate.nullable(),
    returnedOn: isoDate.nullable(),
  }),
  evaluation: evaluationDto,
  nextStep: nextStepDto,
  /** The version used for the checklist; the baseline when no guru is chosen yet. */
  ruleVersion: ruleVersionRef,
  documents: z.array(documentDto),
  exceptions: z.array(exceptionDto),
  latestRecommendation: recommendationDto.nullable(),
  latestGuruResponse: guruResponseDto.nullable(),
  actions: applicationActions,
});
export type ApplicationDetail = z.infer<typeof applicationDetail>;

export const createCandidateResponse = z.object({
  candidateId: z.string().uuid(),
  applicationId: z.string().uuid(),
});
export type CreateCandidateResponse = z.infer<typeof createCandidateResponse>;
