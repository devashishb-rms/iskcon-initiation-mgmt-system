import type { ParsedRow } from './row-validation';
import type { RowMessage } from './messages';

export type RowStatus = 'OK' | 'WARNING' | 'ERROR';
/** What the commit does with the row. */
export type RowPlan = 'CREATE' | 'SKIP';

/** One row as kept in `import_jobs.rows` between the preview and the commit. */
export interface StoredRow {
  line: number;
  status: RowStatus;
  plan: RowPlan;
  messages: RowMessage[];
  /** Validated and resolved; present for every row that can be created. */
  data?: ParsedRow & { mentorId?: string; guruId?: string };
}

export interface Totals {
  rows: number;
  ok: number;
  warnings: number;
  errors: number;
}

export const totalsOf = (rows: readonly Pick<StoredRow, 'status'>[]): Totals => ({
  rows: rows.length,
  ok: rows.filter((r) => r.status === 'OK').length,
  warnings: rows.filter((r) => r.status === 'WARNING').length,
  errors: rows.filter((r) => r.status === 'ERROR').length,
});
