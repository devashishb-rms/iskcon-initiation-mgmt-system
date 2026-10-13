import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { documentType, type DocumentDto } from '@iskcon/contracts';
import { z } from 'zod';
import { ValidationFailed } from '../../../common/errors';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { RequirePermission } from '../../../platform/access/decorators';
import { DocumentsService, type OpenedDocument } from '../application/documents.service';
import { contentDisposition } from './content-disposition';

/** The multipart text field next to the `file` part. */
const uploadFields = z.object({ type: documentType });

/** What multer (memory storage) gives us; the rest of its file object is of no interest. */
interface UploadedPart {
  originalname: string;
  buffer: Buffer;
}

/** Headers every download carries: the stored type is the sniffed one, and nothing may be cached or sniffed or scripted. */
const SAFE_DOWNLOAD_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; sandbox",
} as const;

@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly uow: UnitOfWork,
  ) {}

  @Get('applications/:id/documents')
  @RequirePermission('document:read')
  list(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentDto[]> {
    return this.uow.run(() => this.documents.list(id));
  }

  /** multipart/form-data: `file` and `type`. The size limit and memory storage are set in `DocumentsModule`. */
  @Post('applications/:id/documents')
  @RequirePermission('document:upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(uploadFields)) fields: z.infer<typeof uploadFields>,
    @UploadedFile() file: UploadedPart | undefined,
  ): Promise<DocumentDto> {
    if (!file) throw new ValidationFailed([{ path: 'file', code: 'FILE_REQUIRED' }]);
    return this.uow.run(() => this.documents.upload(id, fields.type, { originalName: file.originalname, content: file.buffer }));
  }

  /** Download: always as an attachment, whatever the browser would like to do with it. */
  @Get('documents/:id/file')
  @RequirePermission('document:read')
  @Header('X-Content-Type-Options', SAFE_DOWNLOAD_HEADERS['X-Content-Type-Options'])
  @Header('Cache-Control', SAFE_DOWNLOAD_HEADERS['Cache-Control'])
  @Header('Content-Security-Policy', SAFE_DOWNLOAD_HEADERS['Content-Security-Policy'])
  async download(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    return this.stream(await this.uow.run(() => this.documents.open(id)), 'attachment');
  }

  /** Viewing in the page (the web app's preview). Only the allow-listed types exist, none of which can run script. */
  @Get('documents/:id/content')
  @RequirePermission('document:read')
  @Header('X-Content-Type-Options', SAFE_DOWNLOAD_HEADERS['X-Content-Type-Options'])
  @Header('Cache-Control', SAFE_DOWNLOAD_HEADERS['Cache-Control'])
  @Header('Content-Security-Policy', SAFE_DOWNLOAD_HEADERS['Content-Security-Policy'])
  async view(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    return this.stream(await this.uow.run(() => this.documents.open(id)), 'inline');
  }

  @Delete('documents/:id')
  @RequirePermission('document:upload')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.uow.run(() => this.documents.remove(id));
  }

  private stream({ document, content }: OpenedDocument, kind: 'attachment' | 'inline'): StreamableFile {
    return new StreamableFile(content, {
      type: document.mime,
      length: document.sizeBytes,
      disposition: contentDisposition(kind, document.filename),
    });
  }
}
