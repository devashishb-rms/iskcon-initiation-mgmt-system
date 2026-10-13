import type { RowMessage } from './messages';
import { ROW_ERRORS } from './messages';

export interface MentorRef {
  id: string;
  name: string;
  email: string | null;
}
export interface GuruRef {
  id: string;
  name: string;
  active: boolean;
}

/** Spaces collapsed and Unicode composed, so the same Bengali or Hindi name typed two ways matches. */
export const nameKey = (value: string): string => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');

/** The cell holds the mentor's e-mail address or their exact name. */
export function resolveMentor(value: string, mentors: readonly MentorRef[]): { id: string } | { error: RowMessage } {
  const wanted = nameKey(value);
  const matches = value.includes('@') ? mentors.filter((m) => m.email && nameKey(m.email) === wanted) : mentors.filter((m) => nameKey(m.name) === wanted);
  if (matches.length === 1) return { id: matches[0]!.id };
  return { error: { code: matches.length ? ROW_ERRORS.mentorAmbiguous : ROW_ERRORS.mentorUnknown, params: { value } } };
}

/** The cell holds the guru's exact name. */
export function resolveGuru(value: string, gurus: readonly GuruRef[]): { id: string } | { error: RowMessage } {
  const wanted = nameKey(value);
  const match = gurus.find((g) => nameKey(g.name) === wanted);
  if (!match) return { error: { code: ROW_ERRORS.guruUnknown, params: { value } } };
  if (!match.active) return { error: { code: ROW_ERRORS.guruInactive, params: { value } } };
  return { id: match.id };
}
