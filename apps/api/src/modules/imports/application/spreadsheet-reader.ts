import type { SpreadsheetType } from '../domain/file-type';

/** A sheet as text: the heading row and the rows under it, each with its line number in the file. */
export interface RawTable {
  headings: string[];
  rows: Array<{ line: number; cells: string[] }>;
}

/**
 * Reads one file format into a RawTable. Every cell is text; nothing is evaluated. A new format is a
 * new reader in SPREADSHEET_READERS.
 */
export abstract class SpreadsheetReader {
  abstract readonly type: SpreadsheetType;
  /** Throws `UnreadableSpreadsheet` when the content is not a valid file of this format. */
  abstract read(content: Buffer): Promise<RawTable>;
}

export class UnreadableSpreadsheet extends Error {
  constructor(
    readonly reason: 'UNREADABLE' | 'EMPTY' | 'TOO_MANY_ROWS',
    message?: string,
  ) {
    super(message ?? reason);
  }
}

export const SPREADSHEET_READERS = Symbol('SPREADSHEET_READERS');
