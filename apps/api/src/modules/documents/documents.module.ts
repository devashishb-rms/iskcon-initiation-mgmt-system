import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { StorageModule } from '../../platform/storage';
import { CandidatesModule } from '../candidates';
import { DocumentsFacet } from './application/documents.facet';
import { DocumentsService } from './application/documents.service';
import { NoopVirusScanner, VirusScanner } from './application/virus-scanner';
import { DocumentsController } from './http/documents.controller';
import { DocumentsRepository } from './infrastructure/documents.repository';

/**
 * Uploads and private storage of the documents on an application file. Uploads are held in memory up
 * to MAX_UPLOAD_MB (larger requests are cut off by the parser with 413 FILE_TOO_LARGE), checked by
 * magic bytes, scanned through the `VirusScanner` port and stored under a random key. Contributes
 * the checklist's document evidence, the document list, timeline entries and `canUpload` through
 * `DocumentsFacet`.
 */
@Module({
  imports: [
    CandidatesModule, // provides the ApplicationAccess port
    StorageModule,
    MulterModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        // No `storage`/`dest`: multer then keeps the file in memory (Buffer), which is what the service reads.
        limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 8, fieldSize: 1024 },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsRepository,
    DocumentsService,
    DocumentsFacet,
    // Replace with a real scanner (ClamAV...) here; see virus-scanner.ts.
    { provide: VirusScanner, useClass: NoopVirusScanner },
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
