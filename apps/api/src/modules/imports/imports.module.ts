import { Module } from '@nestjs/common';
import { CandidatesModule } from '../candidates';
import { GurusModule } from '../gurus';
import { ImportCommitService } from './application/import-commit.service';
import { ImportPreviewService } from './application/import-preview.service';
import { ImportReferenceData } from './application/import-reference-data.service';
import { ImportRowWriter } from './application/import-row-writer.service';
import { ImportTemplateService } from './application/import-template.service';
import { SPREADSHEET_READERS, type SpreadsheetReader } from './application/spreadsheet-reader';
import { ImportsController } from './http/imports.controller';
import { CsvReader } from './infrastructure/csv-reader';
import { ImportJobsRepository } from './infrastructure/import-jobs.repository';
import { XlsxReader } from './infrastructure/xlsx-reader';

/**
 * Spreadsheet import of existing aspirants (FR-23): upload, preview every row, then commit. People are
 * created only through the candidates module. A new file format is a new reader in SPREADSHEET_READERS.
 */
@Module({
  imports: [CandidatesModule, GurusModule],
  controllers: [ImportsController],
  providers: [
    ImportJobsRepository,
    CsvReader,
    XlsxReader,
    { provide: SPREADSHEET_READERS, inject: [CsvReader, XlsxReader], useFactory: (...readers: SpreadsheetReader[]) => readers },
    ImportReferenceData,
    ImportTemplateService,
    ImportPreviewService,
    ImportRowWriter,
    ImportCommitService,
  ],
})
export class ImportsModule {}
