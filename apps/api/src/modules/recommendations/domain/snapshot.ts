import type { EvaluationDto } from '@iskcon/contracts';
import type { RuleParams } from '@iskcon/rules-engine';

/**
 * What is stored with every decision (`recommendations.evaluation_snapshot`): the parameters in force
 * and the checklist as it stood, so history does not change when a rule set is later republished.
 */
export interface DecisionSnapshot {
  params: RuleParams;
  evaluation: EvaluationDto;
  guru: { id: string; name: string } | null;
}

/** Narrow the stored JSON back to a snapshot; anything unexpected yields `null` rather than a crash. */
export function readSnapshot(value: unknown): DecisionSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<DecisionSnapshot>;
  if (!v.evaluation || !Array.isArray(v.evaluation.items) || !v.params) return null;
  return { params: v.params, evaluation: v.evaluation, guru: v.guru ?? null };
}
