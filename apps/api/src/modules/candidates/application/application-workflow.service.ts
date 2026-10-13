import { Injectable } from '@nestjs/common';
import type { Stage } from '@iskcon/contracts';
import { Conflict, NotFound, RuleViolation } from '../../../common/errors';
import { Clock } from '../../../platform/clock/clock';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationWorkflow } from '../../../shared/application-ports';
import { AuditService } from '../../audit';
import { canMove } from '../domain/stage-machine';
import { CandidatesRepository } from '../infrastructure/candidates.repository';

/**
 * The only code that changes an application's stage or closes it. Other modules reach it through
 * the `ApplicationWorkflow` port. Every move takes a row lock first, so two people acting on the
 * same file (the president approving while the mentor edits) are processed one after the other.
 */
@Injectable()
export class ApplicationWorkflowService extends ApplicationWorkflow {
  constructor(
    private readonly repo: CandidatesRepository,
    private readonly ctx: RequestContextService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {
    super();
  }

  private async lockOpen(applicationId: string) {
    const a = await this.repo.findApplication(this.ctx.tenantId, applicationId, true);
    if (!a) throw new NotFound('Application');
    if (a.status !== 'OPEN') throw new Conflict('CONFLICT', 'This application is closed', { status: a.status });
    return a;
  }

  async transition(applicationId: string, to: Stage, options: { reason?: string } = {}): Promise<void> {
    const a = await this.lockOpen(applicationId);
    if (!canMove(a.stage, to)) {
      throw new RuleViolation('INVALID_STAGE_TRANSITION', `Cannot move from ${a.stage} to ${to}`, { from: a.stage, to });
    }
    await this.repo.updateApplication(this.ctx.tenantId, applicationId, { stage: to, stageSince: this.clock.now() });
    await this.repo.insertStageEvent({
      tenantId: this.ctx.tenantId,
      applicationId,
      fromStage: a.stage,
      toStage: to,
      actorId: this.ctx.current().user?.id ?? null,
      reason: options.reason ?? null,
    });
    await this.audit.record({
      action: 'application.stage-changed',
      entityType: 'application',
      entityId: applicationId,
      applicationId,
      detail: { from: a.stage, to, ...(options.reason ? { reason: options.reason } : {}) },
    });
  }

  async close(applicationId: string, status: 'DECLINED' | 'WITHDRAWN' | 'COMPLETED', reason?: string): Promise<void> {
    await this.lockOpen(applicationId);
    await this.repo.updateApplication(this.ctx.tenantId, applicationId, { status, closedAt: this.clock.now() });
    await this.audit.record({
      action: 'application.closed',
      entityType: 'application',
      entityId: applicationId,
      applicationId,
      detail: { status, ...(reason ? { reason } : {}) },
    });
  }

  async recordInitiation(applicationId: string, date: string): Promise<void> {
    const a = await this.repo.findApplication(this.ctx.tenantId, applicationId, true);
    if (!a) throw new NotFound('Application');
    await this.repo.updateApplication(this.ctx.tenantId, applicationId, { firstInitiationDate: date });
    await this.audit.record({
      action: 'application.initiation-recorded',
      entityType: 'application',
      entityId: applicationId,
      applicationId,
      detail: { date },
    });
  }

  async addSendBackNote(applicationId: string, body: string): Promise<void> {
    const user = this.ctx.user();
    await this.repo.insertNote({ tenantId: this.ctx.tenantId, applicationId, kind: 'SEND_BACK', body, authorId: user.id });
  }
}
