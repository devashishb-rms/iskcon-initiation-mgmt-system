/** Calendar date as `YYYY-MM-DD`. The engine never sees a time zone or a clock. */
export type IsoDate = string;

export const TRACKS = ['FIRST', 'SECOND'] as const;
export type Track = (typeof TRACKS)[number];

export const DOCUMENT_TYPES = [
  'SHELTER_ACCEPTANCE',
  'EXAM_RESULT',
  'COURSE_CERTIFICATE',
  'ESSAY',
  'OATH',
  'BIO_DATA',
  'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const EXAM_STATUSES = ['PASSED', 'FAILED', 'NOT_TAKEN'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

/** The rule IDs of PRD section "Baseline rules the MVP checks". */
export const RULE_IDS = ['R-1', 'R-2', 'R-3', 'R-4', 'R-5', 'R-6', 'R-7', 'R-8'] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const CHECK_STATUSES = ['MET', 'UNKNOWN', 'NOT_MET', 'LATER', 'EXCEPTION'] as const;
/**
 * MET        the record shows the rule is satisfied
 * UNKNOWN    nobody has recorded it yet. This is NOT a failure.
 * NOT_MET    the record shows the rule is not satisfied
 * LATER      the item opens at a later stage (the president's letter)
 * EXCEPTION  a committee member recorded a written exception
 */
export type CheckStatus = (typeof CHECK_STATUSES)[number];

/** Months and switches that a rule set stores as data. Changing 12 to 18 needs no code change. */
export interface RuleParams {
  practiceMonths: number;
  shelterMonths: number;
  secondGapMonths: number;
  changeGuruMonths: number;
  returnGapMonths: number;
  examRequired: boolean;
  courseRequired: boolean;
  letterRequired: boolean;
  requiredDocuments: DocumentType[];
}

/** What the record says about one application. Identity-based fields do not exist, by design (NFR-1). */
export interface ApplicationFacts {
  track: Track;
  practiceSince?: IsoDate | null;
  shelterDate?: IsoDate | null;
  examStatus?: ExamStatus | null;
  courseComplete?: boolean | null;
  firstInitiationDate?: IsoDate | null;
  /** Set only when the candidate changed guru (R-7). */
  guruChangedOn?: IsoDate | null;
  /** Set only when the devotee returned after leaving ISKCON (R-8). */
  returnedOn?: IsoDate | null;
}

export interface RecordedException {
  ruleId: RuleId;
  reason: string;
}

export interface EvaluationContext {
  /** Document types on file for this application. */
  documents: readonly DocumentType[];
  exceptions: readonly RecordedException[];
  /** True once the president has approved, which produces the letter (R-5). */
  approved: boolean;
  /** Passed in by the caller so the engine stays pure and testable. */
  today: IsoDate;
}

/** A message the UI translates. Codes, never English sentences, cross the API. */
export interface Message {
  code: string;
  params?: Record<string, string | number>;
}

export type SourceCode =
  | 'MENTOR_CONFIRMATION'
  | 'TEMPLE_RECORD'
  | 'REGISTER'
  | 'UPLOADED_CERTIFICATE'
  | 'RECOMMENDATION_RECORD'
  | 'COMMITTEE_EXCEPTION';

export interface ChecklistItem {
  id: RuleId;
  label: Message;
  status: CheckStatus;
  /** Set when an exception replaced this status. */
  originalStatus?: CheckStatus;
  detail: Message;
  source: SourceCode | null;
  /** The date a time-based rule is or was met. */
  dueOn: IsoDate | null;
}

export interface Evaluation {
  items: ChecklistItem[];
  /** IDs that stop approval until met or covered by an exception. */
  blockers: RuleId[];
  canApprove: boolean;
  missingDocuments: DocumentType[];
  counts: Record<CheckStatus, number>;
  /** Worst status for list views: NOT_MET outranks UNKNOWN outranks MET. */
  worst: 'MET' | 'UNKNOWN' | 'NOT_MET';
  summary: { met: number; total: number };
}
