import type { Rule, RuleInput, RuleOutcome } from './rule';

/** R-3: the prescribed examination has been passed. First initiation only. */
export const examRule: Rule = {
  id: 'R-3',
  order: 30,
  blocksApproval: true,
  appliesTo: ({ facts, params }) => facts.track === 'FIRST' && params.examRequired,
  label: () => ({ code: 'rule.R-3.label' }),
  evaluate({ facts }: RuleInput): RuleOutcome {
    switch (facts.examStatus) {
      case 'PASSED':
        return { status: 'MET', detail: { code: 'rule.R-3.detail.passed' }, source: 'TEMPLE_RECORD' };
      case 'NOT_TAKEN':
        return { status: 'NOT_MET', detail: { code: 'rule.R-3.detail.notTaken' } };
      case 'FAILED':
        return { status: 'NOT_MET', detail: { code: 'rule.R-3.detail.failed' } };
      default:
        return { status: 'UNKNOWN', detail: { code: 'rule.R-3.detail.unknown' } };
    }
  },
};

/** R-4: Disciples Course complete, with the certificate on file. */
export const courseRule: Rule = {
  id: 'R-4',
  order: 40,
  blocksApproval: true,
  appliesTo: ({ params }) => params.courseRequired,
  label: () => ({ code: 'rule.R-4.label' }),
  evaluate({ facts, documents }: RuleInput): RuleOutcome {
    const hasCertificate = documents.has('COURSE_CERTIFICATE');
    if (facts.courseComplete === true && hasCertificate) {
      return { status: 'MET', detail: { code: 'rule.R-4.detail.met' }, source: 'UPLOADED_CERTIFICATE' };
    }
    if (facts.courseComplete === true) {
      return { status: 'UNKNOWN', detail: { code: 'rule.R-4.detail.noCertificate' } };
    }
    if (facts.courseComplete === false) {
      return { status: 'NOT_MET', detail: { code: 'rule.R-4.detail.notComplete' } };
    }
    return { status: 'UNKNOWN', detail: { code: 'rule.R-4.detail.unknown' } };
  },
};

/** R-5: the president's written recommendation. Produced by the approval itself, so it never blocks it. */
export const letterRule: Rule = {
  id: 'R-5',
  order: 50,
  blocksApproval: false,
  appliesTo: ({ params }) => params.letterRequired,
  label: () => ({ code: 'rule.R-5.label' }),
  evaluate({ approved }: RuleInput): RuleOutcome {
    return approved
      ? { status: 'MET', detail: { code: 'rule.R-5.detail.met' }, source: 'RECOMMENDATION_RECORD' }
      : { status: 'LATER', detail: { code: 'rule.R-5.detail.later' } };
  },
};
