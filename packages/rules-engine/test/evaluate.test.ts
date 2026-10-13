import { describe, expect, it } from 'vitest';
import {
  addMonths,
  checkAgainstFloor,
  evaluate,
  GBC_FLOOR,
  nextStep,
  type ApplicationFacts,
  type EvaluationContext,
  type RuleParams,
} from '../src';

const TODAY = '2026-10-11';
const params: RuleParams = {
  ...GBC_FLOOR,
  requiredDocuments: ['SHELTER_ACCEPTANCE', 'EXAM_RESULT', 'COURSE_CERTIFICATE'],
};
const base: ApplicationFacts = {
  track: 'FIRST',
  practiceSince: '2025-09-01',
  shelterDate: '2026-01-01',
  examStatus: 'PASSED',
  courseComplete: true,
};
const ctx = (over: Partial<EvaluationContext> = {}): EvaluationContext => ({
  documents: ['COURSE_CERTIFICATE'],
  exceptions: [],
  approved: false,
  today: TODAY,
  ...over,
});
const ev = (facts: Partial<ApplicationFacts> = {}, over: Partial<EvaluationContext> = {}, p = params) =>
  evaluate({ ...base, ...facts }, p, ctx(over));
const status = (e: ReturnType<typeof ev>, id: string) => e.items.find((i) => i.id === id)?.status;

describe('addMonths', () => {
  it('clamps to the end of a short month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-10-11', -12)).toBe('2025-10-11');
  });
  it('rejects a value that is not a real calendar date', () => {
    expect(() => addMonths('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('evaluate', () => {
  it('a complete record has every item met and can be approved', () => {
    const e = ev();
    expect(e.items.map((i) => i.status)).toEqual(['MET', 'MET', 'MET', 'MET', 'LATER']);
    expect(e.canApprove).toBe(true);
    expect(e.summary).toEqual({ met: 4, total: 4 });
  });

  it('unknown is not failed: a missing exam result is UNKNOWN yet still blocks approval', () => {
    const e = ev({ examStatus: null });
    expect(status(e, 'R-3')).toBe('UNKNOWN');
    expect(e.canApprove).toBe(false);
    expect(e.blockers).toEqual(['R-3']);
    expect(e.worst).toBe('UNKNOWN');
  });

  it('a failed item outranks an unknown one on lists', () => {
    const e = ev({ examStatus: null, practiceSince: '2026-06-01' });
    expect(status(e, 'R-1')).toBe('NOT_MET');
    expect(e.worst).toBe('NOT_MET');
  });

  it('a time rule reports the date it will be met', () => {
    const item = ev({ practiceSince: '2026-03-11' }).items[0]!;
    expect(item.status).toBe('NOT_MET');
    expect(item.dueOn).toBe('2027-03-11');
    expect(item.detail.code).toBe('rule.R-1.detail.notMet');
  });

  it('exactly 12 months counts as met, one day short does not', () => {
    expect(status(ev({ practiceSince: '2025-10-11' }), 'R-1')).toBe('MET');
    expect(status(ev({ practiceSince: '2025-10-12' }), 'R-1')).toBe('NOT_MET');
  });

  it('course marked complete without a certificate is UNKNOWN, not failed', () => {
    const e = ev({}, { documents: [] });
    expect(status(e, 'R-4')).toBe('UNKNOWN');
    expect(e.items.find((i) => i.id === 'R-4')?.detail.code).toBe('rule.R-4.detail.noCertificate');
  });

  it('an exception turns a failed or unknown item into EXCEPTION and unblocks approval', () => {
    const e = ev({ courseComplete: false }, { exceptions: [{ ruleId: 'R-4', reason: 'Waived for illness' }] });
    const item = e.items.find((i) => i.id === 'R-4')!;
    expect(item.status).toBe('EXCEPTION');
    expect(item.originalStatus).toBe('NOT_MET');
    expect(item.source).toBe('COMMITTEE_EXCEPTION');
    expect(e.canApprove).toBe(true);
  });

  it('an exception never hides a rule that is already met', () => {
    const e = ev({}, { exceptions: [{ ruleId: 'R-1', reason: 'x' }] });
    expect(status(e, 'R-1')).toBe('MET');
    expect(e.items[0]!.originalStatus).toBeUndefined();
  });

  it('a stricter rule set changes the result with no code change', () => {
    expect(status(ev({}, {}, { ...params, shelterMonths: 12 }), 'R-2')).toBe('NOT_MET');
  });

  it('exam can be switched off by a rule set, if the floor allowed it', () => {
    const e = ev({ examStatus: null }, {}, { ...params, examRequired: false });
    expect(e.items.map((i) => i.id)).not.toContain('R-3');
  });

  it('second initiation uses the gap since first initiation and has no shelter or exam rule', () => {
    const e = evaluate(
      { track: 'SECOND', practiceSince: '2025-01-01', firstInitiationDate: '2026-01-01', courseComplete: true },
      params,
      ctx(),
    );
    expect(e.items.map((i) => i.id)).toEqual(['R-1', 'R-6', 'R-4', 'R-5']);
    expect(status(e, 'R-6')).toBe('NOT_MET');
    expect(e.items.find((i) => i.id === 'R-1')?.label.code).toBe('rule.R-1.label.second');
  });

  it('R-7 and R-8 apply only when their dates are recorded', () => {
    expect(ev().items.map((i) => i.id)).not.toContain('R-7');
    const e = ev({ guruChangedOn: '2026-06-01', returnedOn: '2025-01-01' });
    expect(status(e, 'R-7')).toBe('NOT_MET');
    expect(e.items.find((i) => i.id === 'R-7')?.dueOn).toBe('2026-12-01');
    expect(status(e, 'R-8')).toBe('NOT_MET');
    expect(e.canApprove).toBe(false);
  });

  it('lists missing required documents', () => {
    expect(ev({}, { documents: [] }).missingDocuments).toEqual([
      'SHELTER_ACCEPTANCE',
      'EXAM_RESULT',
      'COURSE_CERTIFICATE',
    ]);
  });

  it('the approval itself satisfies R-5, and R-5 never blocks approval', () => {
    expect(status(ev({}, { approved: true }), 'R-5')).toBe('MET');
    expect(ev().blockers).not.toContain('R-5');
  });

  it('is deterministic and does not mutate its inputs', () => {
    const facts = Object.freeze({ ...base });
    const context = Object.freeze(ctx());
    const a = evaluate(facts, params, context);
    const b = evaluate(facts, params, context);
    expect(a).toEqual(b);
  });
});

describe('checkAgainstFloor', () => {
  it('accepts values at or above the floor', () => {
    expect(checkAgainstFloor({ ...GBC_FLOOR, shelterMonths: 12 })).toEqual([]);
  });
  it('refuses values below the floor, with the floor in the message params', () => {
    expect(checkAgainstFloor({ ...GBC_FLOOR, shelterMonths: 3 })).toEqual([
      { field: 'shelterMonths', code: 'BELOW_FLOOR', params: { value: 3, floor: 6 } },
    ]);
  });
  it('refuses to switch off a requirement the floor makes mandatory', () => {
    expect(checkAgainstFloor({ ...GBC_FLOOR, examRequired: false })).toEqual([
      { field: 'examRequired', code: 'CANNOT_DISABLE' },
    ]);
  });
  it('refuses non-integers, negatives and non-numbers', () => {
    for (const bad of ['abc', 1.5, -1, null]) {
      expect(checkAgainstFloor({ ...GBC_FLOOR, practiceMonths: bad })[0]?.code).toBe('NOT_WHOLE_MONTHS');
    }
  });
});

describe('nextStep', () => {
  it('asks for the certificate before the exam, since the candidate can do that now', () => {
    const e = ev({ examStatus: null }, { documents: [] });
    expect(nextStep(e)).toMatchObject({ code: 'UPLOAD_COURSE_CERTIFICATE', ruleId: 'R-4' });
  });
  it('says to wait, with the date, when only time is missing', () => {
    const e = ev({ practiceSince: '2026-03-11' });
    expect(nextStep(e)).toEqual({ code: 'WAIT_UNTIL', ruleId: 'R-1', dueOn: '2027-03-11' });
  });
  it('says the file is ready for review when every blocker is cleared', () => {
    expect(nextStep(ev()).code).toBe('READY_FOR_REVIEW');
  });
});
