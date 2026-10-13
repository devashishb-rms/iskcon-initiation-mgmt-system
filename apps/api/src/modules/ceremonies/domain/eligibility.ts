import type { ApplicationStatus, Stage, Track } from '@iskcon/contracts';
import type { LatestGuruResponse } from './ceremony';

/** Everything that can keep an application out of a ceremony. */
export type IneligibleReason =
  | 'NOT_OPEN'
  | 'STAGE_NOT_RECOMMENDED'
  | 'TRACK_MISMATCH'
  | 'GURU_MISMATCH'
  | 'GURU_NOT_ACCEPTED'
  | 'ALREADY_ATTACHED';

export interface EligibilityInput {
  application: { status: ApplicationStatus; stage: Stage; track: Track; guruId: string | null };
  ceremony: { track: Track; guruId: string };
  /** The most recent answer from the guru's office, or `null` if there is none. */
  latestGuruResponse: LatestGuruResponse;
  /** Already attached to a PLANNED ceremony (this one or another). */
  attachedToPlannedCeremony: boolean;
}

/**
 * Who may attend: an OPEN application at RECOMMENDED, on the ceremony's track and with the
 * ceremony's guru, whose guru's office has accepted (the latest answer is ACCEPTED), and who is not
 * already attached to a planned ceremony. Returns every reason that fails, in a stable order.
 */
export function ineligibleReasons(i: EligibilityInput): IneligibleReason[] {
  const out: IneligibleReason[] = [];
  if (i.application.status !== 'OPEN') out.push('NOT_OPEN');
  if (i.application.stage !== 'RECOMMENDED') out.push('STAGE_NOT_RECOMMENDED');
  if (i.application.track !== i.ceremony.track) out.push('TRACK_MISMATCH');
  if (i.application.guruId !== i.ceremony.guruId) out.push('GURU_MISMATCH');
  if (i.latestGuruResponse !== 'ACCEPTED') out.push('GURU_NOT_ACCEPTED');
  if (i.attachedToPlannedCeremony) out.push('ALREADY_ATTACHED');
  return out;
}

/** At completion an attendee must still be an OPEN application at RECOMMENDED (the guru may have said "wait" since). */
export const canBeInitiated = (application: Pick<EligibilityInput['application'], 'status' | 'stage'>): boolean =>
  application.status === 'OPEN' && application.stage === 'RECOMMENDED';
