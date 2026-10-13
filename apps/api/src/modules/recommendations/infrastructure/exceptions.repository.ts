import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../../../database/database.module';
import { ruleExceptions } from '../../../database/schema';

export interface ExceptionRecord {
  applicationId: string;
  ruleId: string;
  reason: string;
  createdById: string;
  createdAt: Date;
}

@Injectable()
export class ExceptionsRepository {
  constructor(private readonly db: DbService) {}

  /** One exception per rule and application: recording again replaces the reason and the person. */
  async upsert(row: { tenantId: string; applicationId: string; ruleId: string; reason: string; createdById: string }): Promise<ExceptionRecord> {
    const [r] = await this.db.client
      .insert(ruleExceptions)
      .values(row)
      .onConflictDoUpdate({
        target: [ruleExceptions.applicationId, ruleExceptions.ruleId],
        set: { reason: row.reason, createdById: row.createdById, createdAt: sql`now()` },
      })
      .returning();
    return toRecord(r!);
  }

  /** Returns false when there was nothing to remove. */
  async remove(tenantId: string, applicationId: string, ruleId: string): Promise<boolean> {
    const rows = await this.db.client
      .delete(ruleExceptions)
      .where(and(eq(ruleExceptions.tenantId, tenantId), eq(ruleExceptions.applicationId, applicationId), eq(ruleExceptions.ruleId, ruleId)))
      .returning({ id: ruleExceptions.id });
    return rows.length > 0;
  }

  async listByApplications(tenantId: string, applicationIds: string[]): Promise<ExceptionRecord[]> {
    if (!applicationIds.length) return [];
    const rows = await this.db.client
      .select()
      .from(ruleExceptions)
      .where(and(eq(ruleExceptions.tenantId, tenantId), inArray(ruleExceptions.applicationId, applicationIds)))
      .orderBy(asc(ruleExceptions.ruleId));
    return rows.map(toRecord);
  }
}

const toRecord = (r: typeof ruleExceptions.$inferSelect): ExceptionRecord => ({
  applicationId: r.applicationId,
  ruleId: r.ruleId,
  reason: r.reason,
  createdById: r.createdById,
  createdAt: r.createdAt,
});
