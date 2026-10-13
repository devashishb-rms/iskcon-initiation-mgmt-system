import { Injectable } from '@nestjs/common';
import { Conflict, RuleViolation } from '../../../common/errors';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { AuditService } from '../../audit';
import { cleanName, hasName, type NewRegisterEntry, type RegisterEntry } from '../domain/register-entry';
import { RegisterRepository } from '../infrastructure/register.repository';

/**
 * The write side the other modules may call. A register entry is created only when a ceremony
 * completes, in the caller's unit of work, so the entry and the ceremony commit or roll back together.
 * Entries are never deleted (the table refuses it); a mistake is corrected, with the reason on record.
 */
@Injectable()
export class RegisterService {
  constructor(
    private readonly repo: RegisterRepository,
    private readonly ctx: RequestContextService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Writes one entry per person. Call it inside the caller's unit of work. Refuses blank names and
   * anyone who is already in the register (a person is initiated once per application).
   */
  async createEntries(entries: NewRegisterEntry[]): Promise<RegisterEntry[]> {
    if (!entries.length) return [];
    const tenantId = this.ctx.tenantId;
    const blank = entries.filter((e) => !hasName(e.spiritualName));
    if (blank.length) {
      throw new RuleViolation(
        'VALIDATION_FAILED',
        'A register entry needs a spiritual name',
        undefined,
        blank.map((e) => ({ path: `spiritualNames.${e.applicationId}`, code: 'SPIRITUAL_NAME_REQUIRED', params: { candidateName: e.candidateName } })),
      );
    }
    const ids = entries.map((e) => e.applicationId);
    if (new Set(ids).size !== ids.length) throw new Conflict('CONFLICT', 'The same application appears twice');
    const existing = await this.repo.findByApplicationIds(tenantId, ids);
    if (existing.length) {
      throw new Conflict('CONFLICT', 'Already in the register', { applicationId: existing[0]!.applicationId });
    }
    const created = await this.repo.insertMany(
      tenantId,
      entries.map((e) => ({ ...e, candidateName: cleanName(e.candidateName), spiritualName: cleanName(e.spiritualName) })),
    );
    for (const e of created) {
      await this.audit.record({
        action: 'register.entry-created',
        entityType: 'register_entry',
        entityId: e.id,
        applicationId: e.applicationId,
        detail: { ceremonyId: e.ceremonyId, initiatedOn: e.initiatedOn, track: e.track, guruId: e.guruId, spiritualName: e.spiritualName },
      });
    }
    return created;
  }

  /** The entry that made this application's person initiated, if any. */
  async findByApplication(applicationId: string): Promise<RegisterEntry | undefined> {
    return (await this.repo.findByApplicationIds(this.ctx.tenantId, [applicationId]))[0];
  }
}
