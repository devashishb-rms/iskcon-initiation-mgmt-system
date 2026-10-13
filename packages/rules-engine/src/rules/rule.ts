import type {
  ApplicationFacts,
  CheckStatus,
  DocumentType,
  IsoDate,
  Message,
  RuleId,
  RuleParams,
  SourceCode,
} from '../types';
import { addMonths, isOnOrBefore } from '../dates';

export interface RuleInput {
  facts: ApplicationFacts;
  params: RuleParams;
  documents: ReadonlySet<DocumentType>;
  approved: boolean;
  today: IsoDate;
}

export interface RuleOutcome {
  status: CheckStatus;
  detail: Message;
  source?: SourceCode;
  dueOn?: IsoDate;
}

/**
 * One rule = one class of reasoning. To add a rule, create a file, implement this interface and
 * register it in `registry.ts`. `evaluate()` is never edited (open/closed).
 */
export interface Rule {
  readonly id: RuleId;
  /** Display order within the checklist. */
  readonly order: number;
  /** False only for rules the approval itself produces (the president's letter). */
  readonly blocksApproval: boolean;
  appliesTo(input: RuleInput): boolean;
  label(input: RuleInput): Message;
  evaluate(input: RuleInput): RuleOutcome;
}

/** "Have `months` months passed since `since`?" Unknown when there is no start date. */
export function elapsedMonths(
  since: IsoDate | null | undefined,
  months: number,
  today: IsoDate,
): { status: 'MET' | 'NOT_MET' | 'UNKNOWN'; dueOn?: IsoDate } {
  if (!since) return { status: 'UNKNOWN' };
  const dueOn = addMonths(since, months);
  return { status: isOnOrBefore(dueOn, today) ? 'MET' : 'NOT_MET', dueOn };
}
