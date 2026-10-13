import type { Rule } from './rules/rule';
import { examRule, courseRule, letterRule } from './rules/record-rules';
import {
  changeGuruRule,
  practiceRule,
  returnGapRule,
  secondGapRule,
  shelterRule,
} from './rules/time-rules';

/** Every rule the engine knows. Add a rule here and nowhere else. */
export const DEFAULT_RULES: readonly Rule[] = Object.freeze(
  [practiceRule, shelterRule, secondGapRule, examRule, changeGuruRule, returnGapRule, courseRule, letterRule].sort(
    (a, b) => a.order - b.order,
  ),
);
