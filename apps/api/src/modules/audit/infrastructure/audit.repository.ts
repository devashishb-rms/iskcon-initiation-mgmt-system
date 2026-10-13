import { Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import { DbService } from '../../../database/database.module';
import { auditLog } from '../../../database/schema';

export type AuditRow = typeof auditLog.$inferSelect;
export type NewAuditRow = typeof auditLog.$inferInsert;

@Injectable()
export class AuditRepository {
  constructor(private readonly db: DbService) {}

  async insert(row: NewAuditRow): Promise<void> {
    await this.db.client.insert(auditLog).values(row);
  }

  async list(
    tenantId: string,
    filter: { applicationId?: string; action?: string },
    page: number,
    pageSize: number,
  ): Promise<{ rows: AuditRow[]; total: number }> {
    const where = and(
      eq(auditLog.tenantId, tenantId),
      filter.applicationId ? eq(auditLog.applicationId, filter.applicationId) : undefined,
      filter.action ? eq(auditLog.action, filter.action) : undefined,
    );
    const rows = await this.db.client
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [{ n } = { n: 0 }] = await this.db.client.select({ n: count() }).from(auditLog).where(where);
    return { rows, total: Number(n) };
  }
}
