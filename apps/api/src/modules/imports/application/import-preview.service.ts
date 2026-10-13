import { Inject, Injectable } from '@nestjs/common';
import type { ImportPreview } from '@iskcon/contracts';
import { AppError, ValidationFailed } from '../../../common/errors';
import { Clock } from '../../../platform/clock/clock';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { TenantDirectory } from '../../../platform/tenancy/tenancy.module';
import { AuditService } from '../../audit';
import { normalizePhone } from '../../identity';
import { mapHeaders, type ImportField } from '../domain/columns';
import { detectSpreadsheetType, hasAllowedExtension } from '../domain/file-type';
import { MAX_FILE_BYTES, MAX_ROWS, oldestCommittable } from '../domain/limits';
import { planRows, type PlannedRow } from '../domain/plan';
import type { RawRow } from '../domain/row-validation';
import { totalsOf, type StoredRow } from '../domain/stored-row';
import { ImportJobsRepository } from '../infrastructure/import-jobs.repository';
import { ImportReferenceData } from './import-reference-data.service';
import { SPREADSHEET_READERS, SpreadsheetReader, UnreadableSpreadsheet, type RawTable } from './spreadsheet-reader';

export interface UploadedFile {
  originalName: string;
  content: Buffer;
}

/**
 * Reads an uploaded sheet, checks every row and keeps the outcome for the commit. Nothing about any
 * person is created here; the only things written are the preview itself and its audit line.
 */
@Injectable()
export class ImportPreviewService {
  private readonly readers: Map<string, SpreadsheetReader>;

  constructor(
    @Inject(SPREADSHEET_READERS) readers: SpreadsheetReader[],
    private readonly reference: ImportReferenceData,
    private readonly jobs: ImportJobsRepository,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
    private readonly tenants: TenantDirectory,
  ) {
    this.readers = new Map(readers.map((r) => [r.type, r]));
  }

  async preview(file: UploadedFile): Promise<ImportPreview> {
    const table = await this.read(file);
    const mapping = mapHeaders(table.headings);
    if (mapping.missing.length) {
      throw new ValidationFailed(mapping.missing.map((column) => ({ path: 'file', code: 'MISSING_COLUMN', params: { column } })));
    }
    if (table.rows.length === 0) throw new ValidationFailed([{ path: 'file', code: 'NO_ROWS' }]);
    if (table.rows.length > MAX_ROWS) throw new ValidationFailed([{ path: 'file', code: 'TOO_MANY_ROWS', params: { max: MAX_ROWS } }]);

    const inputs = table.rows.map(({ line, cells }) => ({ line, raw: toRaw(cells, mapping.columns) }));
    const reference = await this.reference.load();
    const tenant = await this.tenants.byId(this.ctx.tenantId);
    const planned = planRows(inputs, reference, { today: this.clock.today(tenant?.timezone), normalizePhone });
    const totals = totalsOf(planned);

    const user = this.ctx.user();
    const now = this.clock.now();
    await this.jobs.scrubExpired(this.ctx.tenantId, oldestCommittable(now));
    const filename = safeFilename(file.originalName);
    const id = await this.jobs.insert({
      tenantId: this.ctx.tenantId,
      filename,
      // The echo is for the response only; it holds what the person typed and is not kept.
      rows: planned.map(toStored),
      summary: { totals, ignoredColumns: mapping.ignored.length },
      createdById: user.id,
      createdAt: now,
    });
    await this.audit.record({ action: 'import.previewed', entityType: 'import', entityId: id, detail: { importJobId: id, filename, ...totals } });
    return { id, filename, totals, results: planned.map(toResult) };
  }

  private async read(file: UploadedFile): Promise<RawTable> {
    if (file.content.length > MAX_FILE_BYTES) {
      throw new AppError('FILE_TOO_LARGE', 413, 'The file is larger than the limit', { maxMb: MAX_FILE_BYTES / (1024 * 1024) });
    }
    const type = detectSpreadsheetType(file.content);
    if (!hasAllowedExtension(file.originalName) || !type) {
      throw new AppError('FILE_TYPE_NOT_ALLOWED', 415, 'Only .csv and .xlsx files are accepted');
    }
    try {
      return await this.readers.get(type)!.read(file.content);
    } catch (err) {
      if (!(err instanceof UnreadableSpreadsheet)) throw err;
      if (err.reason === 'TOO_MANY_ROWS') throw new ValidationFailed([{ path: 'file', code: 'TOO_MANY_ROWS', params: { max: MAX_ROWS } }]);
      if (err.reason === 'EMPTY') throw new ValidationFailed([{ path: 'file', code: 'NO_ROWS' }]);
      // A zip that is not a workbook, or a workbook that cannot be opened: not a file we accept.
      throw new AppError('FILE_TYPE_NOT_ALLOWED', 415, err.message);
    }
  }
}

function toRaw(cells: string[], columns: Array<ImportField | null>): RawRow {
  const raw: RawRow = {};
  columns.forEach((field, i) => {
    if (field && cells[i]) raw[field] = cells[i];
  });
  return raw;
}

const toStored = (r: PlannedRow): StoredRow => ({ line: r.line, status: r.status, plan: r.plan, messages: r.messages, data: r.data });

const toResult = (r: PlannedRow): ImportPreview['results'][number] => ({
  line: r.line,
  status: r.status,
  messages: r.messages.map((m) => ({ code: m.code, ...(m.params ? { params: m.params } : {}) })),
  row: r.echo,
});

/** The name of the uploaded file as it will appear in logs and the audit trail: no path, no control characters. */
export function safeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (base || 'upload').slice(0, 200);
}

