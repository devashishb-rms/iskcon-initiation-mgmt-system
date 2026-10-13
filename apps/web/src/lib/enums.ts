import { documentType, examStatus, ruleId, track, STAGES } from '@iskcon/contracts';

/** Enum value lists, read from the shared contracts (one source of truth). */
export const DOCUMENT_TYPES = documentType.options;
export const EXAM_STATUSES = examStatus.options;
export const RULE_IDS = ruleId.options;
export const TRACKS = track.options;
export { STAGES };

export type DocumentTypeValue = (typeof DOCUMENT_TYPES)[number];
export type ExamStatusValue = (typeof EXAM_STATUSES)[number];

