import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { MAX_ROWS } from '../domain/limits';
import { UnreadableSpreadsheet, SpreadsheetReader, type RawTable } from '../application/spreadsheet-reader';
import { cleanCell } from './cell-text';

/** Stops reading a file that is mostly blank lines long before it can use much memory. */
const MAX_RECORDS = MAX_ROWS * 5;

@Injectable()
export class CsvReader extends SpreadsheetReader {
  readonly type = 'csv' as const;

  async read(content: Buffer): Promise<RawTable> {
    let records: string[][];
    try {
      records = parse(content.toString('utf8'), {
        bom: true,
        relax_column_count: true,
        relax_quotes: true,
        skip_empty_lines: false,
        to: MAX_RECORDS + 1,
      }) as string[][];
    } catch {
      throw new UnreadableSpreadsheet('UNREADABLE', 'The CSV could not be parsed');
    }
    if (records.length > MAX_RECORDS) throw new UnreadableSpreadsheet('TOO_MANY_ROWS');
    const lines = records.map((cells, i) => ({ line: i + 1, cells: cells.map(cleanCell) }));
    const nonEmpty = lines.filter((l) => l.cells.some((c) => c !== ''));
    const [heading, ...rows] = nonEmpty;
    if (!heading) throw new UnreadableSpreadsheet('EMPTY');
    return { headings: heading.cells, rows };
  }
}
