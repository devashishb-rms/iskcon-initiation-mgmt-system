/** What one import may be. Checked on the way in; the numbers are part of the product (FR-23). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 2000;
/** A preview that is not committed within this time is refused (its rows hold personal data). */
export const IMPORT_TTL_MS = 24 * 60 * 60 * 1000;

/** The oldest a preview may be, at `now`, and still be committed. */
export const oldestCommittable = (now: Date): Date => new Date(now.getTime() - IMPORT_TTL_MS);
