import type { CeremonyDto, GuruResponseType, Track } from '@iskcon/contracts';

export type CeremonyStatus = CeremonyDto['status'];

export interface Ceremony {
  id: string;
  guruId: string;
  track: Track;
  venue: string;
  /** Calendar date (YYYY-MM-DD), never an instant. */
  date: string;
  status: CeremonyStatus;
}

export interface Attendee {
  applicationId: string;
  present: boolean;
  spiritualName: string | null;
}

export type LatestGuruResponse = GuruResponseType | null;

/** Why a ceremony cannot be completed right now, or `null` when it can. */
export type CompletionBlock = 'NOT_PLANNED' | 'DATE_IN_FUTURE';

/**
 * A ceremony can be completed once, on or after its date. `today` is the calendar date from the
 * `Clock` (never `new Date()`); both are `YYYY-MM-DD` strings, which compare correctly as text.
 */
export function completionBlock(ceremony: Pick<Ceremony, 'status' | 'date'>, today: string): CompletionBlock | null {
  if (ceremony.status !== 'PLANNED') return 'NOT_PLANNED';
  if (ceremony.date > today) return 'DATE_IN_FUTURE';
  return null;
}

export interface CompletionPlan {
  /** Present attendees with the spiritual name that goes into the register. */
  present: Array<{ applicationId: string; spiritualName: string }>;
  /** Attendees who did not come: they are detached and stay RECOMMENDED. */
  absent: string[];
  /** Present attendees without a spiritual name. Completion must stop while this is not empty. */
  missingNames: string[];
}

/**
 * Splits the attendees into those present and absent and finds the name for each person who was
 * present: the one given at completion, else the one noted when attendance was marked.
 */
export function planCompletion(attendees: Attendee[], given: Readonly<Record<string, string>>): CompletionPlan {
  const plan: CompletionPlan = { present: [], absent: [], missingNames: [] };
  for (const a of attendees) {
    if (!a.present) {
      plan.absent.push(a.applicationId);
      continue;
    }
    const name = (given[a.applicationId] ?? a.spiritualName ?? '').trim();
    if (name) plan.present.push({ applicationId: a.applicationId, spiritualName: name });
    else plan.missingNames.push(a.applicationId);
  }
  return plan;
}
