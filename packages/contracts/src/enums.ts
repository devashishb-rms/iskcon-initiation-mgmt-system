import { z } from 'zod';
import { DOCUMENT_TYPES, EXAM_STATUSES, RULE_IDS, TRACKS } from '@iskcon/rules-engine';

export const ROLES = ['CANDIDATE', 'MENTOR', 'PRESIDENT', 'COMMITTEE', 'ADMIN'] as const;
export const role = z.enum(ROLES);
export type Role = z.infer<typeof role>;

export const track = z.enum(TRACKS);
export type Track = z.infer<typeof track>;

export const STAGES = ['ASPIRING', 'SHELTER', 'PREPARING', 'APPLIED', 'RECOMMENDED', 'INITIATED'] as const;
export const stage = z.enum(STAGES);
export type Stage = z.infer<typeof stage>;

export const APPLICATION_STATUSES = ['OPEN', 'DECLINED', 'WITHDRAWN', 'COMPLETED'] as const;
export const applicationStatus = z.enum(APPLICATION_STATUSES);
export type ApplicationStatus = z.infer<typeof applicationStatus>;

export const examStatus = z.enum(EXAM_STATUSES);
export const documentType = z.enum(DOCUMENT_TYPES);
export const ruleId = z.enum(RULE_IDS);

export const NOTE_KINDS = ['MONTHLY', 'READINESS', 'MESSAGE', 'SEND_BACK'] as const;
export const noteKind = z.enum(NOTE_KINDS);
export type NoteKind = z.infer<typeof noteKind>;

export const decision = z.enum(['APPROVE', 'SEND_BACK', 'DECLINE']);
export type Decision = z.infer<typeof decision>;

export const guruResponseType = z.enum(['ACCEPTED', 'WAIT', 'DECLINED']);
export type GuruResponseType = z.infer<typeof guruResponseType>;

export const ceremonyStatus = z.enum(['PLANNED', 'COMPLETED', 'CANCELLED']);
export const channel = z.enum(['IN_APP', 'EMAIL', 'SMS']);
export const locale = z.enum(['en', 'bn', 'hi']);
export type Locale = z.infer<typeof locale>;
export const LOCALES = locale.options;
