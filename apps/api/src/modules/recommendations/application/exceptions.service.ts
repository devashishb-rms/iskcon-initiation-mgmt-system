import { Injectable } from '@nestjs/common';
import type { ExceptionDto } from '@iskcon/contracts';
import type { RuleId } from '@iskcon/rules-engine';
import { Conflict, NotFound, ValidationFailed } from '../../../common/errors';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationAccess } from '../../../shared/application-ports';
import { AuditService } from '../../audit';
import { UsersService } from '../../identity';
import { canRecordException, isExceptable } from '../domain/stage-rules';
import { ExceptionsRepository } from '../infrastructure/exceptions.repository';

/**
 * Written committee exceptions: "this rule is not met, the committee accepts that, and here is why".
 * They count as evidence in the checklist (through the facet) and are listed on the file. The
 * checklist never hides a rule that is met, and R-5 cannot be waived: it is the president's own letter.
 */
@Injectable()
export class ExceptionsService {
  constructor(
    private readonly repo: ExceptionsRepository,
    private readonly access: ApplicationAccess,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
  ) {}

  /** Records (or replaces) the exception for one rule. The permission is checked on the route. */
  async record(applicationId: string, ruleId: RuleId, reason: string): Promise<ExceptionDto> {
    const app = await this.access.assertCanRead(applicationId);
    if (!isExceptable(ruleId)) throw new ValidationFailed([{ path: 'ruleId', code: 'RULE_NOT_EXCEPTABLE', params: { ruleId } }]);
    if (!canRecordException(app)) {
      throw new Conflict('CONFLICT', 'Exceptions can be recorded only while the file is with the president', { stage: app.stage, status: app.status });
    }
    const user = this.ctx.user();
    const row = await this.repo.upsert({ tenantId: this.ctx.tenantId, applicationId, ruleId, reason, createdById: user.id });
    await this.audit.record({
      action: 'exception.recorded',
      entityType: 'rule_exception',
      entityId: `${applicationId}:${ruleId}`,
      applicationId,
      detail: { ruleId, reason },
    });
    return { ruleId: row.ruleId, reason: row.reason, recordedBy: user.name, recordedAt: row.createdAt.toISOString() };
  }

  async remove(applicationId: string, ruleId: RuleId): Promise<void> {
    const app = await this.access.assertCanRead(applicationId);
    if (!canRecordException(app)) {
      throw new Conflict('CONFLICT', 'Exceptions can be removed only while the file is with the president', { stage: app.stage, status: app.status });
    }
    if (!(await this.repo.remove(this.ctx.tenantId, applicationId, ruleId))) throw new NotFound('Exception');
    await this.audit.record({
      action: 'exception.removed',
      entityType: 'rule_exception',
      entityId: `${applicationId}:${ruleId}`,
      applicationId,
      detail: { ruleId },
    });
  }

  /** The exceptions on a file, for the application detail. */
  async list(applicationId: string): Promise<ExceptionDto[]> {
    const rows = await this.repo.listByApplications(this.ctx.tenantId, [applicationId]);
    const names = new Map((await this.users.findMany(rows.map((r) => r.createdById))).map((u) => [u.id, u.name]));
    return rows.map((r) => ({
      ruleId: r.ruleId,
      reason: r.reason,
      recordedBy: names.get(r.createdById) ?? 'Unknown',
      recordedAt: r.createdAt.toISOString(),
    }));
  }
}
