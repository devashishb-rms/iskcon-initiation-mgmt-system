import { elapsedMonths, type Rule, type RuleInput, type RuleOutcome } from './rule';
import type { IsoDate, Message, RuleId, SourceCode } from '../types';

interface TimeRuleSpec {
  id: RuleId;
  order: number;
  applies(input: RuleInput): boolean;
  since(input: RuleInput): IsoDate | null | undefined;
  months(input: RuleInput): number;
  label(input: RuleInput): Message;
  /** Message codes. `{since, months, dueOn}` are always passed as params. */
  codes: { unknown: string; met: string; notMet: string };
  metSource: SourceCode;
}

/** Shared shape of R-1, R-2, R-6, R-7 and R-8: a start date plus a number of months. */
function timeRule(spec: TimeRuleSpec): Rule {
  return {
    id: spec.id,
    order: spec.order,
    blocksApproval: true,
    appliesTo: spec.applies,
    label: spec.label,
    evaluate(input): RuleOutcome {
      const since = spec.since(input);
      const months = spec.months(input);
      const r = elapsedMonths(since, months, input.today);
      if (r.status === 'UNKNOWN') return { status: 'UNKNOWN', detail: { code: spec.codes.unknown } };
      const params = { since: since as string, months, dueOn: r.dueOn as string };
      return r.status === 'MET'
        ? { status: 'MET', detail: { code: spec.codes.met, params }, source: spec.metSource, dueOn: r.dueOn as string }
        : { status: 'NOT_MET', detail: { code: spec.codes.notMet, params }, dueOn: r.dueOn as string };
    },
  };
}

/** R-1: practice standard, confirmed by the mentor with a start date. */
export const practiceRule = timeRule({
  id: 'R-1',
  order: 10,
  applies: () => true,
  since: ({ facts }) => facts.practiceSince,
  months: ({ params }) => params.practiceMonths,
  label: ({ facts, params }) => ({
    code: facts.track === 'SECOND' ? 'rule.R-1.label.second' : 'rule.R-1.label.first',
    params: { months: params.practiceMonths },
  }),
  codes: {
    unknown: 'rule.R-1.detail.unknown',
    met: 'rule.R-1.detail.met',
    notMet: 'rule.R-1.detail.notMet',
  },
  metSource: 'MENTOR_CONFIRMATION',
});

/** R-2: accepted in shelter for longer than N months. First initiation only. */
export const shelterRule = timeRule({
  id: 'R-2',
  order: 20,
  applies: ({ facts }) => facts.track === 'FIRST',
  since: ({ facts }) => facts.shelterDate,
  months: ({ params }) => params.shelterMonths,
  label: ({ params }) => ({ code: 'rule.R-2.label', params: { months: params.shelterMonths } }),
  codes: {
    unknown: 'rule.R-2.detail.unknown',
    met: 'rule.R-2.detail.met',
    notMet: 'rule.R-2.detail.notMet',
  },
  metSource: 'TEMPLE_RECORD',
});

/** R-6: more than N months since first initiation. Second initiation only. */
export const secondGapRule = timeRule({
  id: 'R-6',
  order: 25,
  applies: ({ facts }) => facts.track === 'SECOND',
  since: ({ facts }) => facts.firstInitiationDate,
  months: ({ params }) => params.secondGapMonths,
  label: ({ params }) => ({ code: 'rule.R-6.label', params: { months: params.secondGapMonths } }),
  codes: {
    unknown: 'rule.R-6.detail.unknown',
    met: 'rule.R-6.detail.met',
    notMet: 'rule.R-6.detail.notMet',
  },
  metSource: 'REGISTER',
});

/** R-7: a candidate who changed guru has waited. Applies only when a change is recorded. */
export const changeGuruRule = timeRule({
  id: 'R-7',
  order: 35,
  applies: ({ facts }) => Boolean(facts.guruChangedOn),
  since: ({ facts }) => facts.guruChangedOn,
  months: ({ params }) => params.changeGuruMonths,
  label: ({ params }) => ({ code: 'rule.R-7.label', params: { months: params.changeGuruMonths } }),
  codes: {
    unknown: 'rule.R-7.detail.unknown',
    met: 'rule.R-7.detail.met',
    notMet: 'rule.R-7.detail.notMet',
  },
  metSource: 'TEMPLE_RECORD',
});

/** R-8: a devotee who left ISKCON after first initiation has waited after returning. */
export const returnGapRule = timeRule({
  id: 'R-8',
  order: 36,
  applies: ({ facts }) => Boolean(facts.returnedOn),
  since: ({ facts }) => facts.returnedOn,
  months: ({ params }) => params.returnGapMonths,
  label: ({ params }) => ({ code: 'rule.R-8.label', params: { months: params.returnGapMonths } }),
  codes: {
    unknown: 'rule.R-8.detail.unknown',
    met: 'rule.R-8.detail.met',
    notMet: 'rule.R-8.detail.notMet',
  },
  metSource: 'TEMPLE_RECORD',
});
