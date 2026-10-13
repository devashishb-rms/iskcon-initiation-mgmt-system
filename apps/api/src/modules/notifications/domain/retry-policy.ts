/** After this many failed sends a notification is parked as FAILED. */
export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 60_000;

/** Wait before the next try once `attempts` sends have failed: 1, 4, 16, 64 minutes. */
export const retryDelayMs = (attempts: number): number => BASE_DELAY_MS * 4 ** Math.max(0, attempts - 1);

export type FailureOutcome = { give: 'RETRY'; at: Date } | { give: 'FAILED' };

/** What to do after a send failed. `attempts` already counts the one that just failed. */
export function afterFailure(attempts: number, now: Date): FailureOutcome {
  if (attempts >= MAX_ATTEMPTS) return { give: 'FAILED' };
  return { give: 'RETRY', at: new Date(now.getTime() + retryDelayMs(attempts)) };
}
