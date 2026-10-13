import type { Track } from '@iskcon/contracts';

/** A line of the permanent register. */
export interface RegisterEntry {
  id: string;
  applicationId: string;
  /** The name the person had when they were initiated, as written in the register. */
  candidateName: string;
  spiritualName: string;
  track: Track;
  guruId: string;
  ceremonyId: string;
  /** Calendar date (YYYY-MM-DD), never an instant. */
  initiatedOn: string;
  createdAt: Date;
}

/** What a ceremony hands over when it completes. */
export type NewRegisterEntry = Omit<RegisterEntry, 'id' | 'createdAt'>;

export interface RegisterFilter {
  /** Matches the candidate's name or the spiritual name. */
  q?: string;
  guruId?: string;
  track?: Track;
  /** Inclusive bounds on the initiation date. */
  from?: string;
  to?: string;
}

/** What the audit log keeps about a correction, so history is never lost. */
export interface RegisterCorrection {
  before: { spiritualName: string };
  after: { spiritualName: string };
  reason: string;
}

/** The names are trimmed and must not be empty; the register is a legal record, not a draft. */
export const cleanName = (name: string): string => name.trim();

export const hasName = (name: string): boolean => cleanName(name).length > 0;

/** Builds the before/after record for a correction, or `null` when nothing would change. */
export function buildCorrection(current: Pick<RegisterEntry, 'spiritualName'>, spiritualName: string, reason: string): RegisterCorrection | null {
  const next = cleanName(spiritualName);
  if (next === current.spiritualName) return null;
  return { before: { spiritualName: current.spiritualName }, after: { spiritualName: next }, reason: reason.trim() };
}

/** The columns of the CSV export, in order. One place, so the CSV and the PDF cannot drift apart. */
export const EXPORT_COLUMNS = ['Initiated on', 'Spiritual name', 'Name', 'Track', 'Guru'] as const;
