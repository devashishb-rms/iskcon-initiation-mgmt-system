import { DEFAULT_RULES } from './registry';
import type { Rule, RuleInput } from './rules/rule';
import type {
  ApplicationFacts,
  ChecklistItem,
  CheckStatus,
  EvaluationContext,
  Evaluation,
  RuleId,
  RuleParams,
} from './types';

const EMPTY_COUNTS = (): Record<CheckStatus, number> => ({
  MET: 0,
  UNKNOWN: 0,
  NOT_MET: 0,
  LATER: 0,
  EXCEPTION: 0,
});

/**
 * Builds the checklist for one application against one resolved rule version.
 * Pure: the same inputs always give the same answer. Never approves anyone; `canApprove` only
 * says whether the review screen may offer the president the "approve" action.
 */
export function evaluate(
  facts: ApplicationFacts,
  params: RuleParams,
  context: EvaluationContext,
  rules: readonly Rule[] = DEFAULT_RULES,
): Evaluation {
  const input: RuleInput = {
    facts,
    params,
    documents: new Set(context.documents),
    approved: context.approved,
    today: context.today,
  };

  const blocking = new Map<RuleId, boolean>();
  const items: ChecklistItem[] = [];

  for (const rule of rules) {
    if (!rule.appliesTo(input)) continue;
    const outcome = rule.evaluate(input);
    const item: ChecklistItem = {
      id: rule.id,
      label: rule.label(input),
      status: outcome.status,
      detail: outcome.detail,
      source: outcome.source ?? null,
      dueOn: outcome.dueOn ?? null,
    };

    // An exception only covers a rule that is failing or unchecked. It never hides a met rule.
    const exception = context.exceptions.find((e) => e.ruleId === rule.id);
    if (exception && (item.status === 'NOT_MET' || item.status === 'UNKNOWN')) {
      item.originalStatus = item.status;
      item.status = 'EXCEPTION';
      item.detail = { code: 'common.exceptionRecorded', params: { reason: exception.reason } };
      item.source = 'COMMITTEE_EXCEPTION';
    }
    blocking.set(rule.id, rule.blocksApproval);
    items.push(item);
  }

  const blockers = items
    .filter((i) => blocking.get(i.id) && i.status !== 'MET' && i.status !== 'EXCEPTION')
    .map((i) => i.id);

  const counts = EMPTY_COUNTS();
  for (const i of items) counts[i.status]++;

  const checkable = items.filter((i) => blocking.get(i.id));
  const satisfied = checkable.filter((i) => i.status === 'MET' || i.status === 'EXCEPTION').length;

  const have = new Set(context.documents);
  const missingDocuments = params.requiredDocuments.filter((t) => !have.has(t));

  return {
    items,
    blockers,
    canApprove: blockers.length === 0,
    missingDocuments,
    counts,
    worst: counts.NOT_MET ? 'NOT_MET' : counts.UNKNOWN ? 'UNKNOWN' : 'MET',
    summary: { met: satisfied, total: checkable.length },
  };
}
