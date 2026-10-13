import type { Evaluation, IsoDate, RuleId } from './types';

export type NextStepCode =
  | 'UPLOAD_COURSE_CERTIFICATE'
  | 'COMPLETE_COURSE'
  | 'PASS_EXAM'
  | 'MENTOR_CONFIRM_PRACTICE'
  | 'RECORD_SHELTER_DATE'
  | 'RECORD_FIRST_INITIATION'
  | 'WAIT_UNTIL'
  | 'RECORD_FACT'
  | 'READY_FOR_REVIEW';

export interface NextStep {
  code: NextStepCode;
  ruleId: RuleId | null;
  dueOn: IsoDate | null;
}

/** Order in which a candidate is shown what to do: things they can do now come before things to wait for. */
const PRIORITY: RuleId[] = ['R-4', 'R-3', 'R-1', 'R-2', 'R-6', 'R-7', 'R-8'];

/** The one thing the candidate or mentor should do next, derived only from the checklist. */
export function nextStep(evaluation: Evaluation): NextStep {
  for (const id of PRIORITY) {
    const item = evaluation.items.find((i) => i.id === id);
    if (!item || item.status === 'MET' || item.status === 'EXCEPTION' || item.status === 'LATER') continue;
    return { ...describe(id, item.status === 'UNKNOWN', item.detail.code), ruleId: id, dueOn: item.dueOn };
  }
  return { code: 'READY_FOR_REVIEW', ruleId: null, dueOn: null };
}

function describe(id: RuleId, unknown: boolean, detailCode: string): { code: NextStepCode } {
  switch (id) {
    case 'R-4':
      return { code: detailCode.endsWith('noCertificate') ? 'UPLOAD_COURSE_CERTIFICATE' : unknown ? 'RECORD_FACT' : 'COMPLETE_COURSE' };
    case 'R-3':
      return { code: unknown ? 'RECORD_FACT' : 'PASS_EXAM' };
    case 'R-1':
      return { code: unknown ? 'MENTOR_CONFIRM_PRACTICE' : 'WAIT_UNTIL' };
    case 'R-2':
      return { code: unknown ? 'RECORD_SHELTER_DATE' : 'WAIT_UNTIL' };
    case 'R-6':
      return { code: unknown ? 'RECORD_FIRST_INITIATION' : 'WAIT_UNTIL' };
    default:
      return { code: unknown ? 'RECORD_FACT' : 'WAIT_UNTIL' };
  }
}
