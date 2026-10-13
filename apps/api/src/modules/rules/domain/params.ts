import { GBC_FLOOR, type DocumentType, type RuleParams } from '@iskcon/rules-engine';

export { GBC_FLOOR };

/**
 * The values that apply to a guru's candidates: the guru's own rule set, but never below the
 * temple baseline (which is itself never below the GBC floor). If the temple later raises its
 * baseline, a guru's older, lower number is lifted automatically; nothing has to be re-published.
 */
export function mergeWithFloor(params: RuleParams, floor: RuleParams): RuleParams {
  return {
    practiceMonths: Math.max(params.practiceMonths, floor.practiceMonths),
    shelterMonths: Math.max(params.shelterMonths, floor.shelterMonths),
    secondGapMonths: Math.max(params.secondGapMonths, floor.secondGapMonths),
    changeGuruMonths: Math.max(params.changeGuruMonths, floor.changeGuruMonths),
    returnGapMonths: Math.max(params.returnGapMonths, floor.returnGapMonths),
    examRequired: params.examRequired || floor.examRequired,
    courseRequired: params.courseRequired || floor.courseRequired,
    letterRequired: params.letterRequired || floor.letterRequired,
    requiredDocuments: [...new Set<DocumentType>([...floor.requiredDocuments, ...params.requiredDocuments])],
  };
}

/** Which fields differ between two versions, for the audit line and the history view. */
export function diffParams(before: RuleParams | undefined, after: RuleParams): string[] {
  if (!before) return Object.keys(after);
  return (Object.keys(after) as Array<keyof RuleParams>).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
}
