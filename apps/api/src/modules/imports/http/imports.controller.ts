import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { ImportPreview } from '@iskcon/contracts';
import { ValidationFailed } from '../../../common/errors';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { RequirePermission } from '../../../platform/access/decorators';
import { ImportCommitService, type CommitResult } from '../application/import-commit.service';
import { ImportPreviewService } from '../application/import-preview.service';
import { ImportTemplateService } from '../application/import-template.service';
import { MAX_FILE_BYTES } from '../domain/limits';
import { commitImportBody, type CommitImportBody } from './commit-import.schema';

/** What multer (memory storage) gives us; the rest of its file object is of no interest. */
interface UploadedPart {
  originalname: string;
  buffer: Buffer;
}

@Controller('imports')
export class ImportsController {
  constructor(
    private readonly template: ImportTemplateService,
    private readonly preview: ImportPreviewService,
    private readonly commit: ImportCommitService,
    private readonly uow: UnitOfWork,
  ) {}

  @Get('template.csv')
  @RequirePermission('import:run')
  downloadTemplate(@Res() res: Response): void {
    res.type('text/csv; charset=utf-8').attachment('import-template.csv').setHeader('Cache-Control', 'no-store').send(this.template.csv());
  }

  /** multipart/form-data with one part `file`. Larger requests are cut off by the parser with 413 FILE_TOO_LARGE. */
  @Post()
  @RequirePermission('import:run')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4, fieldSize: 1024 } }))
  upload(@UploadedFile() file: UploadedPart | undefined): Promise<ImportPreview> {
    if (!file) throw new ValidationFailed([{ path: 'file', code: 'FILE_REQUIRED' }]);
    return this.uow.run(() => this.preview.preview({ originalName: file.originalname, content: file.buffer }));
  }

  /**
   * Not wrapped in one unit of work, unlike every other handler: each person on the sheet is created
   * in a transaction of their own so that one bad row cannot undo the good ones.
   */
  @Post(':id/commit')
  @RequirePermission('import:run')
  create(@Param('id', ParseUUIDPipe) id: string, @Body(zod(commitImportBody)) body: CommitImportBody): Promise<CommitResult> {
    return this.commit.commit(id, body.consent);
  }
}
