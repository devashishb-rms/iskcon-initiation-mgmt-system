import { afterFailure, MAX_ATTEMPTS, retryDelayMs } from './retry-policy';

describe('retry policy', () => {
  const now = new Date('2026-10-14T06:00:00Z');

  it('waits 1, 4, 16 and 64 minutes between tries', () => {
    expect([1, 2, 3, 4].map((n) => retryDelayMs(n) / 60_000)).toEqual([1, 4, 16, 64]);
  });

  it('schedules a retry after each failure until the last attempt', () => {
    const next = afterFailure(2, now);
    expect(next).toEqual({ give: 'RETRY', at: new Date('2026-10-14T06:04:00Z') });
  });

  it('gives up once the attempts are used', () => {
    expect(afterFailure(MAX_ATTEMPTS - 1, now).give).toBe('RETRY');
    expect(afterFailure(MAX_ATTEMPTS, now)).toEqual({ give: 'FAILED' });
  });
});
