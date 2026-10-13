import { canDecide, canExportPackage, canRecordException, canRecordGuruResponse, isExceptable } from './stage-rules';

describe('stage rules', () => {
  it('offers decisions and exceptions only on an open file at APPLIED', () => {
    expect(canDecide({ stage: 'APPLIED', status: 'OPEN' })).toBe(true);
    expect(canRecordException({ stage: 'APPLIED', status: 'OPEN' })).toBe(true);
    for (const stage of ['ASPIRING', 'SHELTER', 'PREPARING', 'RECOMMENDED', 'INITIATED'] as const) {
      expect(canDecide({ stage, status: 'OPEN' })).toBe(false);
      expect(canRecordException({ stage, status: 'OPEN' })).toBe(false);
    }
    expect(canDecide({ stage: 'APPLIED', status: 'DECLINED' })).toBe(false);
  });

  it('offers the guru response only at RECOMMENDED', () => {
    expect(canRecordGuruResponse({ stage: 'RECOMMENDED', status: 'OPEN' })).toBe(true);
    expect(canRecordGuruResponse({ stage: 'APPLIED', status: 'OPEN' })).toBe(false);
    expect(canRecordGuruResponse({ stage: 'RECOMMENDED', status: 'DECLINED' })).toBe(false);
  });

  it('offers the package from APPLIED onward on open files', () => {
    expect(canExportPackage({ stage: 'PREPARING', status: 'OPEN' })).toBe(false);
    expect(canExportPackage({ stage: 'APPLIED', status: 'OPEN' })).toBe(true);
    expect(canExportPackage({ stage: 'RECOMMENDED', status: 'OPEN' })).toBe(true);
    expect(canExportPackage({ stage: 'APPLIED', status: 'WITHDRAWN' })).toBe(false);
  });

  it('never lets R-5 be excepted', () => {
    expect(isExceptable('R-5')).toBe(false);
    expect(isExceptable('R-2')).toBe(true);
  });
});
