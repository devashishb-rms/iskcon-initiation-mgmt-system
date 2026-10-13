import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { MAX_ROWS } from '../domain/limits';
import { UnreadableSpreadsheet, SpreadsheetReader, type RawTable } from '../application/spreadsheet-reader';
import { cleanCell } from './cell-text';
import { inspectZip, MalformedZip } from './zip-guard';

const MAX_ENTRIES = 500;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_COLUMNS = 64;

type CellValue = ExcelJS.CellValue;

/**
 * Text of a cell as it would be read by eye. A formula cell yields the formula itself (`=...`) and
 * never its cached or computed result: nothing in the file is evaluated, and what the sheet claims
 * a formula produced cannot be trusted.
 */
export function cellText(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if (typeof v.formula === 'string' || typeof v.sharedFormula === 'string') return `=${String(v.formula ?? v.sharedFormula)}`;
    if (Array.isArray(v.richText)) return (v.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('');
    if (typeof v.text === 'string') return v.text;
    if (typeof v.error === 'string') return '';
  }
  return '';
}

@Injectable()
export class XlsxReader extends SpreadsheetReader {
  readonly type = 'xlsx' as const;

  async read(content: Buffer): Promise<RawTable> {
    try {
      const facts = inspectZip(content);
      if (facts.entries > MAX_ENTRIES || facts.uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new UnreadableSpreadsheet('UNREADABLE', 'The workbook is too large when unpacked');
      }
    } catch (err) {
      if (err instanceof MalformedZip) throw new UnreadableSpreadsheet('UNREADABLE', err.message);
      throw err;
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(content as unknown as ExcelJS.Buffer);
    } catch {
      throw new UnreadableSpreadsheet('UNREADABLE', 'Not a readable xlsx workbook');
    }
    const sheet = workbook.worksheets.find((s) => s.state === 'visible') ?? workbook.worksheets[0];
    // A zip with no worksheet at all is not a workbook (a docx, a renamed archive).
    if (!sheet) throw new UnreadableSpreadsheet('UNREADABLE', 'The archive holds no worksheet');

    const width = Math.min(Math.max(sheet.columnCount, 1), MAX_COLUMNS);
    const lines: Array<{ line: number; cells: string[] }> = [];
    sheet.eachRow({ includeEmpty: false }, (row, line) => {
      const cells = Array.from({ length: width }, (_, i) => cleanCell(cellText(row.getCell(i + 1).value)));
      if (cells.some((c) => c !== '')) lines.push({ line, cells });
      if (lines.length > MAX_ROWS * 5) throw new UnreadableSpreadsheet('TOO_MANY_ROWS');
    });
    const [heading, ...rows] = lines;
    if (!heading) throw new UnreadableSpreadsheet('EMPTY');
    return { headings: heading.cells, rows };
  }
}
