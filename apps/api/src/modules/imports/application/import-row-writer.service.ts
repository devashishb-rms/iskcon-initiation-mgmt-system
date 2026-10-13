import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../../../database/database.module';
import { AppError } from '../../../common/errors';
import { AuditService } from '../../audit';
import { CandidatesService } from '../../candidates';
import { ROW_WARNINGS, type RowMessage } from '../domain/messages';
import type { StoredRow } from '../domain/stored-row';

export type RowOutcome = { created: true } | { created: false; skip: RowMessage };

/**
 * Creates one person from one row, in a transaction of its own: if anything about this row goes
 * wrong, this row leaves no trace and the rows before and after it are unaffected. The person is
 * created by the candidates module's public service, so every rule it enforces (consent version,
 * mentor, guru, a login with unique contact details) applies exactly as for a person added by hand.
 */
@Injectable()
export class ImportRowWriter {
  private readonly log = new Logger(ImportRowWriter.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly candidates: CandidatesService,
    private readonly audit: AuditService,
  ) {}

  async write(importJobId: string, row: StoredRow, consentVersion: string): Promise<RowOutcome> {
    const data = row.data;
    if (!data) return { created: false, skip: row.messages[0] ?? { code: 'import.row.failed' } };
    try {
      await this.uow.run(async () => {
        const { candidateId, applicationId } = await this.candidates.createCandidate({
          name: data.name,
          phone: data.phone,
          email: data.email,
          groupName: data.groupName,
          mentorId: data.mentorId,
          guruId: data.guruId,
          track: data.track,
          consent: { accepted: true, version: consentVersion },
          // Someone with a phone or an e-mail address can sign in to see their own path.
          createLogin: Boolean(data.phone || data.email),
        });
        if (data.shelterDate) await this.recordShelter(applicationId, data.track, data.shelterDate);
        await this.audit.record({
          action: 'import.row-created',
          entityType: 'candidate',
          entityId: candidateId,
          applicationId,
          detail: { importJobId, line: row.line, consentVersion },
        });
      });
      return { created: true };
    } catch (err) {
      return { created: false, skip: this.explain(err, row.line) };
    }
  }

  /** A first-initiation candidate who already took shelter enters the SHELTER stage; a second-initiation one only records the date. */
  private async recordShelter(applicationId: string, track: 'FIRST' | 'SECOND', date: string): Promise<void> {
    if (track === 'FIRST') await this.candidates.advance(applicationId, 'SHELTER', date);
    else await this.candidates.updateFacts(applicationId, { shelterDate: date });
  }

  private explain(err: unknown, line: number): RowMessage {
    if (err instanceof AppError) {
      // A person with this e-mail or phone appeared after the preview: the same outcome as a duplicate found then.
      if (err.code === 'CONFLICT' && err.params?.field) return { code: ROW_WARNINGS.duplicateExisting, params: { field: String(err.params.field) } };
      const reason = err.errors?.[0]?.code ?? err.code;
      return { code: 'import.row.failed', params: { reason } };
    }
    this.log.error({ err, line }, 'Import row failed unexpectedly');
    return { code: 'import.row.failed', params: { reason: 'INTERNAL' } };
  }
}
