import type { EvaluationDto } from '@iskcon/contracts';
import { exceptionReason, itemLabel, itemStatus, unmetItemIds } from './checklist-text';
import { readSnapshot } from './snapshot';

const item = (over: Partial<EvaluationDto['items'][number]>): EvaluationDto['items'][number] => ({
  id: 'R-2',
  label: { code: 'rule.R-2.label', params: { months: 6 } },
  status: 'MET',
  detail: { code: 'rule.R-2.detail.met' },
  source: null,
  dueOn: null,
  ...over,
});

describe('checklist text', () => {
  it('writes labels and statuses in English, filling in the numbers', () => {
    expect(itemLabel(item({}))).toBe('Accepted in shelter for at least 6 months');
    expect(itemLabel(item({ label: { code: 'rule.unknown.label' } }))).toBe('rule.unknown.label');
    expect(itemStatus(item({ status: 'UNKNOWN' }))).toBe('Not yet recorded');
  });

  it('finds the reason of a committee exception and the items still open', () => {
    const exception = item({ id: 'R-4', status: 'EXCEPTION', detail: { code: 'common.exceptionRecorded', params: { reason: 'Because' } } });
    expect(exceptionReason(exception)).toBe('Because');
    expect(exceptionReason(item({}))).toBeNull();
    const evaluation = { items: [item({ id: 'R-1', status: 'NOT_MET' }), exception, item({ id: 'R-3', status: 'UNKNOWN' }), item({ id: 'R-5', status: 'LATER' })] } as EvaluationDto;
    expect(unmetItemIds(evaluation)).toEqual(['R-1', 'R-3']);
  });
});

describe('readSnapshot', () => {
  it('accepts a stored snapshot and refuses anything else without throwing', () => {
    const stored = { params: { shelterMonths: 6 }, evaluation: { items: [] }, guru: { id: 'g', name: 'HH' } };
    expect(readSnapshot(stored)?.guru?.name).toBe('HH');
    expect(readSnapshot({ params: {}, evaluation: {} })).toBeNull();
    expect(readSnapshot(null)).toBeNull();
    expect(readSnapshot('x')).toBeNull();
  });
});
