import { Injectable } from '@nestjs/common';
import type { RegisterEntryDto } from '@iskcon/contracts';
import { toCsv } from '../../../common/csv';
import { Clock } from '../../../platform/clock/clock';
import { EXPORT_COLUMNS, type RegisterFilter } from '../domain/register-entry';
import { RegisterPdfRenderer } from '../infrastructure/register-pdf.renderer';
import { RegisterQueryService } from './register-query.service';

/** Produces the downloadable files. Formatting lives in the renderer and `toCsv`; this only gathers rows. */
@Injectable()
export class RegisterExportService {
  constructor(
    private readonly query: RegisterQueryService,
    private readonly pdf: RegisterPdfRenderer,
    private readonly clock: Clock,
  ) {}

  /** Spreadsheet-safe CSV (cells that start with = + - @ are neutralised) with a BOM for Bengali and Hindi names. */
  async csv(filter: RegisterFilter): Promise<string> {
    const rows = await this.query.all(filter);
    return toCsv([...EXPORT_COLUMNS], rows.map(toRow));
  }

  async pdfFile(filter: RegisterFilter): Promise<Buffer> {
    const rows = await this.query.all(filter);
    return this.pdf.render(rows, { generatedOn: this.clock.today(), createdAt: this.clock.now() });
  }
}

export const toRow = (e: RegisterEntryDto): string[] => [e.initiatedOn, e.spiritualName, e.candidateName, e.track, e.guru.name];
