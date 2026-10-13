import type { ApplicationStatus, Stage, Track } from '@iskcon/contracts';
import type { ApplicationFacts, DocumentType } from '@iskcon/rules-engine';

export interface CandidateRecord {
  id: string;
  userId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  groupName: string | null;
  mentorId: string | null;
  consentAt: Date;
  active: boolean;
}

export interface ApplicationRecord {
  id: string;
  candidateId: string;
  track: Track;
  stage: Stage;
  stageSince: Date;
  status: ApplicationStatus;
  guruId: string | null;
  practiceSince: string | null;
  shelterDate: string | null;
  examStatus: 'PASSED' | 'FAILED' | 'NOT_TAKEN' | null;
  courseComplete: boolean | null;
  firstInitiationDate: string | null;
  guruChangedOn: string | null;
  returnedOn: string | null;
  createdAt: Date;
}

/** An application together with the candidate it belongs to. */
export interface ApplicationWithCandidate extends ApplicationRecord {
  candidate: CandidateRecord;
}

/** The facts the rules engine reads, taken from the record. */
export const toFacts = (a: ApplicationRecord): ApplicationFacts => ({
  track: a.track,
  practiceSince: a.practiceSince,
  shelterDate: a.shelterDate,
  examStatus: a.examStatus,
  courseComplete: a.courseComplete,
  firstInitiationDate: a.firstInitiationDate,
  guruChangedOn: a.guruChangedOn,
  returnedOn: a.returnedOn,
});

export type { DocumentType };
