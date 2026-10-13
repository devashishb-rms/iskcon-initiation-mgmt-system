import { completionBlock, planCompletion } from './ceremony';
import { ineligibleReasons, type EligibilityInput } from './eligibility';

describe('completionBlock', () => {
  it('allows a planned ceremony on its date and after', () => {
    expect(completionBlock({ status: 'PLANNED', date: '2026-10-14' }, '2026-10-14')).toBeNull();
    expect(completionBlock({ status: 'PLANNED', date: '2026-10-01' }, '2026-10-14')).toBeNull();
  });
  it('refuses a future date and any status but PLANNED', () => {
    expect(completionBlock({ status: 'PLANNED', date: '2026-10-15' }, '2026-10-14')).toBe('DATE_IN_FUTURE');
    expect(completionBlock({ status: 'COMPLETED', date: '2026-10-01' }, '2026-10-14')).toBe('NOT_PLANNED');
    expect(completionBlock({ status: 'CANCELLED', date: '2026-10-20' }, '2026-10-14')).toBe('NOT_PLANNED');
  });
});

describe('planCompletion', () => {
  const attendees = [
    { applicationId: 'a', present: true, spiritualName: null },
    { applicationId: 'b', present: true, spiritualName: 'Noted Das' },
    { applicationId: 'c', present: false, spiritualName: 'Ignored Das' },
    { applicationId: 'd', present: true, spiritualName: '  ' },
  ];
  it('uses the name given at completion, else the noted one, and lists who has none', () => {
    const plan = planCompletion(attendees, { a: ' Gaura Das ' });
    expect(plan.present).toEqual([
      { applicationId: 'a', spiritualName: 'Gaura Das' },
      { applicationId: 'b', spiritualName: 'Noted Das' },
    ]);
    expect(plan.missingNames).toEqual(['d']);
    expect(plan.absent).toEqual(['c']);
  });
  it('prefers a given name over a noted one', () => {
    expect(planCompletion([attendees[1]!], { b: 'Final Das' }).present[0]!.spiritualName).toBe('Final Das');
  });
});

describe('ineligibleReasons', () => {
  const ok: EligibilityInput = {
    application: { status: 'OPEN', stage: 'RECOMMENDED', track: 'FIRST', guruId: 'g1' },
    ceremony: { track: 'FIRST', guruId: 'g1' },
    latestGuruResponse: 'ACCEPTED',
    attachedToPlannedCeremony: false,
  };
  it('accepts a recommended, accepted application with the same guru and track', () => {
    expect(ineligibleReasons(ok)).toEqual([]);
  });
  it.each([
    ['closed application', { application: { ...ok.application, status: 'COMPLETED' as const } }, 'NOT_OPEN'],
    ['stage before RECOMMENDED', { application: { ...ok.application, stage: 'APPLIED' as const } }, 'STAGE_NOT_RECOMMENDED'],
    ['other track', { application: { ...ok.application, track: 'SECOND' as const } }, 'TRACK_MISMATCH'],
    ['other guru', { application: { ...ok.application, guruId: 'g2' } }, 'GURU_MISMATCH'],
    ['no guru', { application: { ...ok.application, guruId: null } }, 'GURU_MISMATCH'],
    ['no guru answer', { latestGuruResponse: null }, 'GURU_NOT_ACCEPTED'],
    ['guru said wait', { latestGuruResponse: 'WAIT' as const }, 'GURU_NOT_ACCEPTED'],
    ['already attached', { attachedToPlannedCeremony: true }, 'ALREADY_ATTACHED'],
  ])('excludes: %s', (_label, patch, reason) => {
    expect(ineligibleReasons({ ...ok, ...patch })).toEqual([reason]);
  });
});
