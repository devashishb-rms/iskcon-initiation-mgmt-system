import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { DocumentDto } from '@iskcon/contracts';
import type { DocumentType } from '@iskcon/rules-engine';
import { AppError, Conflict, Forbidden, NotFound } from '../../../common/errors';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { Clock } from '../../../platform/clock/clock';
import { EventBus } from '../../../platform/events/event-bus';
import { applicationObjectKey, ObjectNotFoundError, ObjectStorage } from '../../../platform/storage';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationAccess, type ApplicationSummary } from '../../../shared/application-ports';
import { EVENTS, type DocumentUploadedPayload } from '../../../shared/events';
import { AuditService } from '../../audit';
import { UsersService } from '../../identity';
import { detectFile } from '../domain/file-sniffer';
import { sanitiseFilename, withExtension } from '../domain/filename';
import { DocumentsRepository, type DocumentRecord } from '../infrastructure/documents.repository';
import { VirusScanner } from './virus-scanner';

export interface IncomingFile {
  /** The name the client gave. Display text only. */
  originalName: string;
  content: Buffer;
}

export interface OpenedDocument {
  document: DocumentDto;
  content: Readable;
}

/** A document of a file together with a way to read its bytes, for hand-over packages. */
export interface ExportableDocument {
  document: DocumentDto;
  open(): Promise<Readable>;
}

/** Stages from which the file is with the guru's office; its evidence is not taken away any more. */
const FROZEN_EVIDENCE_STAGES = new Set(['RECOMMENDED', 'INITIATED']);

/**
 * Uploads, listing, download and removal of the documents on an application file. Who may see or add
 * to a file is `candidates`' decision, reached through the `ApplicationAccess` port.
 */
@Injectable()
export class DocumentsService {
  private readonly log = new Logger('Documents');

  constructor(
    private readonly repo: DocumentsRepository,
    private readonly access: ApplicationAccess,
    private readonly storage: ObjectStorage,
    private readonly scanner: VirusScanner,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ───────── reading ─────────

  async list(applicationId: string): Promise<DocumentDto[]> {
    return this.listFor(await this.access.assertCanRead(applicationId));
  }

  /** For callers that already hold a checked `ApplicationSummary` (the application file's facet). */
  async listFor(app: ApplicationSummary): Promise<DocumentDto[]> {
    return this.toDtos(await this.repo.listByApplication(this.ctx.tenantId, app.id));
  }

  /** The file's bytes, after the caller was checked against the application the document belongs to. */
  async open(documentId: string): Promise<OpenedDocument> {
    const record = await this.findReadable(documentId);
    const [document] = await this.toDtos([record]);
    return { document: document!, content: await this.read(record) };
  }

  /** For the hand-over package: every document on the file the caller may read. */
  async listForExport(applicationId: string): Promise<ExportableDocument[]> {
    await this.access.assertCanRead(applicationId);
    const records = await this.repo.listByApplication(this.ctx.tenantId, applicationId);
    const dtos = await this.toDtos(records);
    return records.map((r, i) => ({ document: dtos[i]!, open: () => this.read(r) }));
  }

  // ───────── changing ─────────

  async upload(applicationId: string, type: DocumentType, file: IncomingFile): Promise<DocumentDto> {
    const app = await this.access.assertCanContribute(applicationId);
    this.assertOpen(app);

    const maxBytes = this.env.MAX_UPLOAD_MB * 1024 * 1024;
    if (file.content.length > maxBytes) {
      throw new AppError('FILE_TOO_LARGE', 413, 'The file is larger than the limit', { maxMb: this.env.MAX_UPLOAD_MB });
    }
    // The client's name and content type are ignored for deciding what the file is.
    const detected = detectFile(file.content.subarray(0, 32));
    if (!detected) throw new AppError('FILE_TYPE_NOT_ALLOWED', 415, 'Only PDF, PNG, JPEG, WebP and HEIC files are accepted');

    const filename = withExtension(sanitiseFilename(file.originalName), detected.extension);
    const scan = await this.scanner.scan(file.content, { filename, mime: detected.mime });
    if (!scan.clean) {
      await this.audit.record({
        action: 'document.rejected',
        entityType: 'document',
        applicationId,
        detail: { reason: 'virus-scan', threat: scan.threat ?? 'unknown', type },
      });
      throw new AppError('FILE_TYPE_NOT_ALLOWED', 415, 'The file did not pass the security scan', { reason: 'infected' });
    }

    const user = this.ctx.user();
    const record = await this.repo.insert({
      tenantId: this.ctx.tenantId,
      applicationId,
      type,
      filename,
      mime: detected.mime,
      sizeBytes: file.content.length,
      storageKey: applicationObjectKey(this.ctx.tenantId, applicationId),
      sha256: createHash('sha256').update(file.content).digest('hex'),
      uploadedById: user.id,
    });
    await this.audit.record({
      action: 'document.uploaded',
      entityType: 'document',
      entityId: record.id,
      applicationId,
      detail: { type, mime: record.mime, sizeBytes: record.sizeBytes, sha256: record.sha256 },
    });
    await this.events.publish<DocumentUploadedPayload>(EVENTS.documentUploaded, { applicationId, documentId: record.id, type });
    // Last, so a failed write rolls the row back. (If the commit itself later fails, the object is
    // an unreferenced random key in a private bucket: harmless, and swept by storage lifecycle rules.)
    await this.storage.put(record.storageKey, file.content, { mime: record.mime });
    return this.toDto(record, user.name);
  }

  /** Soft delete: the row stays for the audit trail. Only the uploader or an administrator. */
  async remove(documentId: string): Promise<void> {
    const record = await this.repo.find(this.ctx.tenantId, documentId);
    if (!record || record.deletedAt) throw new NotFound('Document');
    const app = await this.access.assertCanContribute(record.applicationId);
    this.assertOpen(app);
    const user = this.ctx.user();
    if (record.uploadedById !== user.id && !user.roles.includes('ADMIN')) throw new Forbidden('Only the uploader or an administrator can remove a document');
    if (FROZEN_EVIDENCE_STAGES.has(app.stage)) {
      throw new Conflict('CONFLICT', 'The file is with the guru\'s office; its documents can no longer be removed', { stage: app.stage });
    }
    await this.repo.markDeleted(this.ctx.tenantId, documentId, this.clock.now());
    await this.audit.record({
      action: 'document.deleted',
      entityType: 'document',
      entityId: documentId,
      applicationId: record.applicationId,
      detail: { type: record.type },
    });
  }

  // ───────── helpers ─────────

  private assertOpen(app: ApplicationSummary): void {
    if (app.status !== 'OPEN') throw new Conflict('CONFLICT', 'This application is closed; its documents are read-only', { status: app.status });
  }

  private async findReadable(documentId: string): Promise<DocumentRecord> {
    const record = await this.repo.find(this.ctx.tenantId, documentId);
    if (!record || record.deletedAt) throw new NotFound('Document');
    await this.access.assertCanRead(record.applicationId); // 404 when the caller may not see the file
    return record;
  }

  private async read(record: DocumentRecord): Promise<Readable> {
    try {
      return await this.storage.get(record.storageKey);
    } catch (e) {
      if (e instanceof ObjectNotFoundError) {
        this.log.error(`Object for document ${record.id} is missing from storage`);
        throw new NotFound('File');
      }
      throw e;
    }
  }

  private async toDtos(records: DocumentRecord[]): Promise<DocumentDto[]> {
    const people = await this.users.findMany(records.map((r) => r.uploadedById));
    const names = new Map(people.map((p) => [p.id, p.name]));
    return records.map((r) => this.toDto(r, names.get(r.uploadedById) ?? 'Unknown'));
  }

  private toDto(r: DocumentRecord, uploadedBy: string): DocumentDto {
    return {
      id: r.id,
      type: r.type,
      filename: r.filename,
      mime: r.mime,
      sizeBytes: r.sizeBytes,
      uploadedBy,
      uploadedAt: r.uploadedAt.toISOString(),
    };
  }
}
