import { Injectable, Logger } from '@nestjs/common';
import { CONSENT_VERSION } from '@iskcon/contracts';
import { Conflict, NotFound, ValidationFailed } from '../../../common/errors';
import { UnitOfWork } from '../../../database/database.module';
import { Clock } from '../../../platform/clock/clock';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { AuditService } from '../../audit';
import { oldestCommittable } from '../domain/limits';
import { ROW_WARNINGS, type RowMessage } from '../domain/messages';
import type { ImportJob } from '../infrastructure/import-jobs.repository';
import { ImportJobsRepository } from '../infrastructure/import-jobs.repository';
import { ImportReferenceData } from './import-reference-data.service';
import { ImportRowWriter } from './import-row-writer.service';

export interface CommitResult {
  created: number;
  skipped: number;
  /** Why each row that was not created was left out; the line is the row's number in the uploaded file. */
  skippedRows: Array<{ line: number; code: string; params?: Record<string, string | number> }>;
}

/**
 * Creates the people of a previewed sheet. The job is claimed first (so a second commit is refused),
 * then every row that can be created gets its own transaction, then the job is closed and the personal
 * data it held is dropped. Rows that cannot be created are skipped and reported, never fatal.
 * This service opens its own transactions: a caller must not wrap it in one.
 */
@Injectable()
export class ImportCommitService {
  private readonly log = new Logger(ImportCommitService.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly jobs: ImportJobsRepository,
    private readonly rows: ImportRowWriter,
    private readonly reference: ImportReferenceData,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
  ) {}

  async commit(jobId: string, consent: { version: string }): Promise<CommitResult> {
    if (consent.version !== CONSENT_VERSION) throw new ValidationFailed([{ path: 'consent.version', code: 'CONSENT_REQUIRED' }]);
    const job = await this.claim(jobId);
    try {
      const result = await this.createPeople(job, consent.version);
      await this.close(job, result, consent.version);
      return result;
    } catch (err) {
      await this.uow.run(() => this.jobs.finish(this.ctx.tenantId, job.id, 'FAILED', { ...job.summary, failedAt: this.clock.now().toISOString() }));
      throw err;
    }
  }

  /** Moves the job from PREVIEWED to COMMITTED, once. A job that is gone, used or too old is refused. */
  private claim(jobId: string): Promise<ImportJob> {
    return this.uow.run(async () => {
      const tenantId = this.ctx.tenantId;
      const now = this.clock.now();
      const claimed = await this.jobs.claimForCommit(tenantId, jobId, now, oldestCommittable(now));
      if (claimed) return claimed;
      const state = await this.jobs.stateOf(tenantId, jobId);
      if (!state) throw new NotFound('Import');
      if (state.status !== 'PREVIEWED') throw new Conflict('CONFLICT', 'This import was already committed', { reason: 'ALREADY_COMMITTED' });
      throw new Conflict('CONFLICT', 'This preview has expired; upload the file again', { reason: 'EXPIRED' });
    });
  }

  private async createPeople(job: ImportJob, consentVersion: string): Promise<CommitResult> {
    // People may have been added since the preview: check again against who exists now.
    const reference = await this.reference.load();
    const skippedRows: CommitResult['skippedRows'] = [];
    let created = 0;
    for (const row of job.rows) {
      if (row.plan !== 'CREATE' || !row.data) {
        skippedRows.push({ line: row.line, ...codeOf(row.messages) });
        continue;
      }
      const taken = row.data.email && reference.existingEmails.has(row.data.email) ? 'email' : row.data.phone && reference.existingPhones.has(row.data.phone) ? 'phone' : null;
      if (taken) {
        skippedRows.push({ line: row.line, code: ROW_WARNINGS.duplicateExisting, params: { field: taken } });
        continue;
      }
      const outcome = await this.rows.write(job.id, row, consentVersion);
      if (outcome.created) created += 1;
      else skippedRows.push({ line: row.line, ...codeOf([outcome.skip]) });
    }
    return { created, skipped: skippedRows.length, skippedRows };
  }

  private close(job: ImportJob, result: CommitResult, consentVersion: string): Promise<void> {
    return this.uow.run(async () => {
      await this.jobs.finish(this.ctx.tenantId, job.id, 'COMMITTED', {
        ...job.summary,
        created: result.created,
        skipped: result.skipped,
        skippedRows: result.skippedRows,
        consentVersion,
        committedAt: this.clock.now().toISOString(),
      });
      await this.audit.record({
        action: 'import.committed',
        entityType: 'import',
        entityId: job.id,
        detail: { importJobId: job.id, filename: job.filename, created: result.created, skipped: result.skipped, consentVersion },
      });
    });
  }
}

/** Warnings that say something about a row but do not explain why it was left out. */
const NOTICES = new Set<string>([ROW_WARNINGS.formulaLike, ROW_WARNINGS.noContact, ROW_WARNINGS.practiceNotApplied]);

/** Why a row was left out: its first message that is not a mere notice. */
function codeOf(messages: RowMessage[]): { code: string; params?: Record<string, string | number> } {
  const first = messages.find((m) => !NOTICES.has(m.code)) ?? messages[0];
  return first ? { code: first.code, ...(first.params ? { params: first.params } : {}) } : { code: 'import.row.failed' };
}
