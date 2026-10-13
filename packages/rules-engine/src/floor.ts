import type { RuleParams } from './types';

/**
 * GBC baseline (1993 resolutions, 2023 clarification, 2015 Disciples Course rule), as relayed in
 * the PRD. A guru's office may raise these values and never lower them. The temple must confirm
 * the figures and any later amendment (PRD open question 4); that is data, not code.
 */
export const GBC_FLOOR: Readonly<RuleParams> = Object.freeze({
  practiceMonths: 12,
  shelterMonths: 6,
  secondGapMonths: 12,
  changeGuruMonths: 6,
  returnGapMonths: 24,
  examRequired: true,
  courseRequired: true,
  letterRequired: true,
  requiredDocuments: [],
});

export const NUMERIC_PARAMS = [
  'practiceMonths',
  'shelterMonths',
  'secondGapMonths',
  'changeGuruMonths',
  'returnGapMonths',
] as const satisfies readonly (keyof RuleParams)[];

export const FLAG_PARAMS = [
  'examRequired',
  'courseRequired',
  'letterRequired',
] as const satisfies readonly (keyof RuleParams)[];

export type ParamIssueCode = 'NOT_WHOLE_MONTHS' | 'BELOW_FLOOR' | 'CANNOT_DISABLE';

export interface ParamIssue {
  field: keyof RuleParams;
  code: ParamIssueCode;
  params?: Record<string, number>;
}

/** A rule set may only be at or above the floor. Returns every problem, or an empty list. */
export function checkAgainstFloor(
  draft: Partial<Record<keyof RuleParams, unknown>>,
  floor: Readonly<RuleParams> = GBC_FLOOR,
): ParamIssue[] {
  const issues: ParamIssue[] = [];
  for (const field of NUMERIC_PARAMS) {
    const value = draft[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      issues.push({ field, code: 'NOT_WHOLE_MONTHS' });
    } else if (value < floor[field]) {
      issues.push({ field, code: 'BELOW_FLOOR', params: { value, floor: floor[field] } });
    }
  }
  for (const field of FLAG_PARAMS) {
    if (floor[field] && draft[field] !== true) issues.push({ field, code: 'CANNOT_DISABLE' });
  }
  return issues;
}
