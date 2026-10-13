import type { RuleParamsDto } from '@iskcon/contracts';
import type { MessageKey } from '@/i18n/core';

export const NUMERIC_FIELDS = [
  { key: 'practiceMonths', rule: 'R-1' },
  { key: 'shelterMonths', rule: 'R-2' },
  { key: 'secondGapMonths', rule: 'R-6' },
  { key: 'changeGuruMonths', rule: 'R-7' },
  { key: 'returnGapMonths', rule: 'R-8' },
] as const satisfies readonly { key: keyof RuleParamsDto; rule: string }[];

export const FLAG_FIELDS = [
  { key: 'examRequired', rule: 'R-3' },
  { key: 'courseRequired', rule: 'R-4' },
  { key: 'letterRequired', rule: 'R-5' },
] as const satisfies readonly { key: keyof RuleParamsDto; rule: string }[];

export type NumericKey = (typeof NUMERIC_FIELDS)[number]['key'];
export type FlagKey = (typeof FLAG_FIELDS)[number]['key'];

export interface ParamChange {
  field: keyof RuleParamsDto;
  from: string;
  to: string;
}

const show = (v: RuleParamsDto[keyof RuleParamsDto] | undefined): string =>
  v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v);

/** What changed between two versions of a rule set (shown in the history). */
export function diffParams(prev: RuleParamsDto | null | undefined, next: RuleParamsDto): ParamChange[] {
  const out: ParamChange[] = [];
  for (const field of Object.keys(next) as (keyof RuleParamsDto)[]) {
    const a = prev?.[field];
    const b = next[field];
    const same = Array.isArray(a) && Array.isArray(b) ? [...a].sort().join() === [...b].sort().join() : a === b;
    if (!same) out.push({ field, from: show(a), to: show(b) });
  }
  return out;
}

export const paramLabelKey = (field: keyof RuleParamsDto): MessageKey => `rules.param.${field}`;

/** Text field state for the editor: numbers are kept as strings so a half-typed value is not lost. */
export interface ParamsDraft {
  numbers: Record<NumericKey, string>;
  flags: Record<FlagKey, boolean>;
  requiredDocuments: string[];
}

export function draftFromParams(p: RuleParamsDto): ParamsDraft {
  return {
    numbers: Object.fromEntries(NUMERIC_FIELDS.map((f) => [f.key, String(p[f.key])])) as Record<NumericKey, string>,
    flags: Object.fromEntries(FLAG_FIELDS.map((f) => [f.key, p[f.key]])) as Record<FlagKey, boolean>,
    requiredDocuments: [...p.requiredDocuments],
  };
}

/** Back to the API shape. A blank or non-numeric value becomes NaN-free `-1`, which the server rejects as NOT_WHOLE_MONTHS. */
export function paramsFromDraft(d: ParamsDraft): RuleParamsDto {
  const n = (k: NumericKey) => (/^\d+$/.test(d.numbers[k].trim()) ? Number(d.numbers[k].trim()) : -1);
  return {
    practiceMonths: n('practiceMonths'),
    shelterMonths: n('shelterMonths'),
    secondGapMonths: n('secondGapMonths'),
    changeGuruMonths: n('changeGuruMonths'),
    returnGapMonths: n('returnGapMonths'),
    examRequired: d.flags.examRequired,
    courseRequired: d.flags.courseRequired,
    letterRequired: d.flags.letterRequired,
    requiredDocuments: d.requiredDocuments as RuleParamsDto['requiredDocuments'],
  };
}

export const sameDraft = (a: ParamsDraft, b: ParamsDraft): boolean => JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
const normalise = (d: ParamsDraft) => ({ ...d, requiredDocuments: [...d.requiredDocuments].sort() });

/** The numeric fields whose text is not a whole, non-negative number of months. */
export const notWholeMonths = (d: ParamsDraft): NumericKey[] => NUMERIC_FIELDS.map((f) => f.key).filter((k) => !/^\d+$/.test(d.numbers[k].trim()));
