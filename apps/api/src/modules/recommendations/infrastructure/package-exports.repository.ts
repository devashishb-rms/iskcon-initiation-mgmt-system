import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { DocumentType } from '@iskcon/rules-engine';
import { DbService } from '../../../database/database.module';
import { packageExports } from '../../../database/schema';

export interface PackageExportRecord {
  id: string;
  applicationId: string;
  missingDocuments: DocumentType[];
  exportedById: string;
  createdAt: Date;
}

@Injectable()
export class PackageExportsRepository {
  constructor(private readonly db: DbService) {}

  async insert(row: { tenantId: string; applicationId: string; missingDocuments: DocumentType[]; exportedById: string }): Promise<PackageExportRecord> {
    const [r] = await this.db.client.insert(packageExports).values(row).returning();
    return toRecord(r!);
  }

  async listByApplication(tenantId: string, applicationId: string): Promise<PackageExportRecord[]> {
    const rows = await this.db.client
      .select()
      .from(packageExports)
      .where(and(eq(packageExports.tenantId, tenantId), eq(packageExports.applicationId, applicationId)))
      .orderBy(asc(packageExports.createdAt), asc(packageExports.id));
    return rows.map(toRecord);
  }
}

const toRecord = (r: typeof packageExports.$inferSelect): PackageExportRecord => ({
  id: r.id,
  applicationId: r.applicationId,
  missingDocuments: r.missingDocuments as DocumentType[],
  exportedById: r.exportedById,
  createdAt: r.createdAt,
});
