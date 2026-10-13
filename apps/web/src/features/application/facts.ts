import type { ApplicationDetail, Track, UpdateFactsBody } from '@iskcon/contracts';

export type FactKey = keyof ApplicationDetail['facts'];
export type FactValue = ApplicationDetail['facts'][FactKey];

export interface FactField {
  key: FactKey;
  input: 'date' | 'exam' | 'course';
  /** Which server permission governs the field (ApplicationDetail.actions). */
  editableBy: 'canSetPractice' | 'canSetTempleFacts';
  tracks: Track[];
  /** Only shown when set (or when the viewer may edit it): applies to some files only. */
  optional?: boolean;
}

export const FACT_FIELDS: FactField[] = [
  { key: 'practiceSince', input: 'date', editableBy: 'canSetPractice', tracks: ['FIRST', 'SECOND'] },
  { key: 'shelterDate', input: 'date', editableBy: 'canSetTempleFacts', tracks: ['FIRST'] },
  { key: 'examStatus', input: 'exam', editableBy: 'canSetTempleFacts', tracks: ['FIRST'] },
  { key: 'courseComplete', input: 'course', editableBy: 'canSetTempleFacts', tracks: ['FIRST', 'SECOND'] },
  { key: 'firstInitiationDate', input: 'date', editableBy: 'canSetTempleFacts', tracks: ['SECOND'] },
  { key: 'guruChangedOn', input: 'date', editableBy: 'canSetTempleFacts', tracks: ['FIRST', 'SECOND'], optional: true },
  { key: 'returnedOn', input: 'date', editableBy: 'canSetTempleFacts', tracks: ['FIRST', 'SECOND'], optional: true },
];

export type FactDraft = Record<FactKey, string>;

/** Form strings for the current facts ('' = not recorded). Booleans are 'true' / 'false'. */
export function draftFromFacts(facts: ApplicationDetail['facts']): FactDraft {
  const s = (v: string | boolean | null): string => (v === null ? '' : String(v));
  return {
    practiceSince: s(facts.practiceSince),
    shelterDate: s(facts.shelterDate),
    examStatus: s(facts.examStatus),
    courseComplete: s(facts.courseComplete),
    firstInitiationDate: s(facts.firstInitiationDate),
    guruChangedOn: s(facts.guruChangedOn),
    returnedOn: s(facts.returnedOn),
  };
}

/** Only the fields the person actually changed, and only those they are allowed to edit. */
export function diffFacts(facts: ApplicationDetail['facts'], draft: FactDraft, editable: (f: FactField) => boolean): UpdateFactsBody {
  const before = draftFromFacts(facts);
  const out: Record<string, unknown> = {};
  for (const f of FACT_FIELDS) {
    if (!editable(f) || draft[f.key] === before[f.key]) continue;
    const raw = draft[f.key];
    if (raw === '') out[f.key] = null;
    else if (f.input === 'course') out[f.key] = raw === 'true';
    else out[f.key] = raw;
  }
  return out as UpdateFactsBody;
}

export function visibleFacts(track: Track, facts: ApplicationDetail['facts'], editable: (f: FactField) => boolean): FactField[] {
  return FACT_FIELDS.filter((f) => f.tracks.includes(track) && (!f.optional || facts[f.key] !== null || editable(f)));
}
