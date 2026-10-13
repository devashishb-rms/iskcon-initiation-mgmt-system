import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { DocumentType } from '@iskcon/rules-engine';
import { DbService } from '../../../database/database.module';
import { documents } from '../../../database/schema';

export interface DocumentRecord {
  id: string;
  applicationId: string;
  type: DocumentType;
  filename: string;
  mime: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  uploadedById: string;
  uploadedAt: Date;
  deletedAt: Date | null;
}

export type NewDocument = Omit<DocumentRecord, 'id' | 'uploadedAt' | 'deletedAt'> & { tenantId: string };

@Injectable()
export class DocumentsRepository {
  constructor(private readonly db: DbService) {}

  async insert(row: NewDocument): Promise<DocumentRecord> {
    const [r] = await this.db.client.insert(documents).values(row).returning();
    return toRecord(r!);
  }

  async find(tenantId: string, id: string): Promise<DocumentRecord | undefined> {
    const [r] = await this.db.client
      .select()
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.id, id)))
      .limit(1);
    return r && toRecord(r);
  }

  /** Documents on the file, oldest first. Soft-deleted ones only when asked for (timeline). */
  async listByApplication(tenantId: string, applicationId: string, includeDeleted = false): Promise<DocumentRecord[]> {
    const rows = await this.db.client
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.applicationId, applicationId),
          includeDeleted ? undefined : isNull(documents.deletedAt),
        ),
      )
      .orderBy(asc(documents.uploadedAt), asc(documents.id));
    return rows.map(toRecord);
  }

  async deletedByApplication(tenantId: string, applicationId: string): Promise<DocumentRecord[]> {
    const rows = await this.db.client
      .select()
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.applicationId, applicationId), isNotNull(documents.deletedAt)))
      .orderBy(asc(documents.deletedAt));
    return rows.map(toRecord);
  }

  /** Document types on file (not deleted) per application, for the checklist. */
  async typesByApplications(tenantId: string, applicationIds: string[]): Promise<Map<string, DocumentType[]>> {
    const out = new Map<string, DocumentType[]>();
    if (!applicationIds.length) return out;
    const rows = await this.db.client
      .select({ applicationId: documents.applicationId, type: documents.type })
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), inArray(documents.applicationId, applicationIds), isNull(documents.deletedAt)));
    for (const r of rows) {
      const types = out.get(r.applicationId) ?? [];
      if (!types.includes(r.type)) types.push(r.type);
      out.set(r.applicationId, types);
    }
    return out;
  }

  async markDeleted(tenantId: string, id: string, at: Date): Promise<void> {
    await this.db.client
      .update(documents)
      .set({ deletedAt: at })
      .where(and(eq(documents.tenantId, tenantId), eq(documents.id, id)));
  }
}

const toRecord = (r: typeof documents.$inferSelect): DocumentRecord => ({
  id: r.id,
  applicationId: r.applicationId,
  type: r.type,
  filename: r.filename,
  mime: r.mime,
  sizeBytes: r.sizeBytes,
  storageKey: r.storageKey,
  sha256: r.sha256,
  uploadedById: r.uploadedById,
  uploadedAt: r.uploadedAt,
  deletedAt: r.deletedAt,
});
