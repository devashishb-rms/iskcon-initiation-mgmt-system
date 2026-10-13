import type { ApplicationStatus, Stage, Track } from '@iskcon/contracts';

/**
 * Ports owned by the shared kernel and implemented by the `candidates` module.
 *
 * Several modules need to ask "may this caller see application X?" or "move X to the next stage".
 * If they imported the candidates module, the module graph would have cycles (candidates reads
 * documents and recommendations for the checklist). They depend on these abstract classes
 * instead, and Nest injects the candidates implementation (dependency inversion).
 */

export interface ApplicationSummary {
  id: string;
  candidateId: string;
  candidateName: string;
  /** The candidate's own login, if they have one. */
  candidateUserId: string | null;
  mentorId: string | null;
  guruId: string | null;
  track: Track;
  stage: Stage;
  status: ApplicationStatus;
}

export abstract class ApplicationAccess {
  /** The application, if the caller may read it; otherwise 404 (never confirm that it exists) or 403. */
  abstract assertCanRead(applicationId: string): Promise<ApplicationSummary>;
  /** Same, for adding material (documents, messages) to it. */
  abstract assertCanContribute(applicationId: string): Promise<ApplicationSummary>;
  /** No caller check. For system work (event handlers, schedulers) and after a caller check was done. */
  abstract find(applicationId: string): Promise<ApplicationSummary | undefined>;
  abstract findMany(applicationIds: string[]): Promise<ApplicationSummary[]>;
}

export abstract class ApplicationWorkflow {
  /**
   * Moves an application to another stage if the state machine allows it for its track, writes the
   * stage event and the audit line, and locks the row so two people cannot move it at once.
   * Throws INVALID_STAGE_TRANSITION otherwise.
   */
  abstract transition(applicationId: string, to: Stage, options?: { reason?: string }): Promise<void>;
  /** Ends an application without initiation (declined by president or guru) or with it (completed). */
  abstract close(applicationId: string, status: 'DECLINED' | 'WITHDRAWN' | 'COMPLETED', reason?: string): Promise<void>;
  /** Completion of a first-initiation ceremony: the date a second initiation is counted from (R-6). */
  abstract recordInitiation(applicationId: string, date: string): Promise<void>;
  /** The president's reason for sending a file back, kept with the file where the mentor reads it. */
  abstract addSendBackNote(applicationId: string, body: string): Promise<void>;
}
