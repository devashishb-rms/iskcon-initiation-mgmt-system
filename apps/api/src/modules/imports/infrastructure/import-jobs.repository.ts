import { Injectable } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DbService } from '../../../database/database.module';
import { importJobs } from '../../../database/schema';
import type { StoredRow } from '../domain/stored-row';

export interface ImportJob {
  id: string;
  filename: string;
  status: 'PREVIEWED' | 'COMMITTED' | 'FAILED';
  rows: StoredRow[];
  summary: Record<string, unknown>;
  createdAt: Date;
}

const columns = {
  id: importJobs.id,
  filename: importJobs.filename,
  status: importJobs.status,
  rows: importJobs.rows,
  summary: importJobs.summary,
  createdAt: importJobs.createdAt,
};

/** The only place that touches the `import_jobs` table. */
@Injectable()
export class ImportJobsRepository {
  constructor(private readonly db: DbService) {}

  async insert(row: { tenantId: string; filename: string; rows: StoredRow[]; summary: Record<string, unknown>; createdById: string; createdAt: Date }): Promise<string> {
    const [created] = await this.db.client
      .insert(importJobs)
      .values({ ...row, status: 'PREVIEWED' })
      .returning({ id: importJobs.id });
    return created!.id;
  }

  /**
   * Takes the job for committing: only one caller can move it from PREVIEWED, and only while it is
   * young enough. The single UPDATE is the lock, so two simultaneous commits cannot both win.
   */
  async claimForCommit(tenantId: string, id: string, now: Date, notBefore: Date): Promise<ImportJob | undefined> {
    const [row] = await this.db.client
      .update(importJobs)
      .set({ status: 'COMMITTED', committedAt: now })
      .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, id), eq(importJobs.status, 'PREVIEWED'), sql`${importJobs.createdAt} >= ${notBefore.toISOString()}::timestamptz`))
      .returning(columns);
    return row as ImportJob | undefined;
  }

  async stateOf(tenantId: string, id: string): Promise<Pick<ImportJob, 'status' | 'createdAt'> | undefined> {
    const [row] = await this.db.client
      .select({ status: importJobs.status, createdAt: importJobs.createdAt })
      .from(importJobs)
      .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, id)))
      .limit(1);
    return row;
  }

  /** Ends a job and drops the personal data it held: only counts and line numbers stay. */
  async finish(tenantId: string, id: string, status: 'COMMITTED' | 'FAILED', summary: Record<string, unknown>): Promise<void> {
    await this.db.client
      .update(importJobs)
      .set({ status, summary, rows: [] })
      .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, id)));
  }

  /** Previews nobody committed within their lifetime are emptied of personal data. */
  async scrubExpired(tenantId: string, notBefore: Date): Promise<void> {
    await this.db.client
      .update(importJobs)
      .set({ rows: [] })
      .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.status, 'PREVIEWED'), lt(importJobs.createdAt, notBefore), sql`${importJobs.rows} <> '[]'::jsonb`));
  }
}
