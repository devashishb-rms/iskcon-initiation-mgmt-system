import { Injectable } from '@nestjs/common';
import type { ApplicationStatus, GuruResponseType, Stage } from '@iskcon/contracts';
import { Conflict, ValidationFailed } from '../../../common/errors';
import { EventBus } from '../../../platform/events/event-bus';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationAccess, ApplicationWorkflow } from '../../../shared/application-ports';
import { EVENTS, type ApplicationDeclinedPayload, type GuruRespondedPayload } from '../../../shared/events';
import { AuditService } from '../../audit';
import { canRecordGuruResponse } from '../domain/stage-rules';
import { DecisionsRepository, type GuruResponseRecord } from '../infrastructure/decisions.repository';

export interface GuruResponseResult {
  applicationId: string;
  responseId: string;
  response: GuruResponseType;
  stage: Stage;
  status: ApplicationStatus;
}

/**
 * The guru's office has the last word and no login: a committee member records its answer.
 * ACCEPTED keeps the file at RECOMMENDED, which is what makes the person eligible for a ceremony.
 * WAIT sends the file back to PREPARING; DECLINED closes it. Answers are append-only.
 */
@Injectable()
export class GuruResponseService {
  constructor(
    private readonly access: ApplicationAccess,
    private readonly workflow: ApplicationWorkflow,
    private readonly repo: DecisionsRepository,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly ctx: RequestContextService,
  ) {}

  async record(applicationId: string, input: { response: GuruResponseType; reason?: string }): Promise<GuruResponseResult> {
    const app = await this.access.assertCanRead(applicationId);
    if (!canRecordGuruResponse(app)) {
      throw new Conflict('CONFLICT', "The guru's office answers about a file the president has recommended", { stage: app.stage, status: app.status });
    }
    if (input.response !== 'ACCEPTED' && !input.reason) throw new ValidationFailed([{ path: 'reason', code: 'REASON_REQUIRED' }]);

    // The workflow takes the row lock and re-checks the state; ACCEPTED changes nothing on the file itself.
    switch (input.response) {
      case 'WAIT':
        await this.workflow.transition(applicationId, 'PREPARING', { reason: input.reason });
        break;
      case 'DECLINED':
        await this.workflow.close(applicationId, 'DECLINED', input.reason);
        break;
      case 'ACCEPTED':
        break;
    }

    const record = await this.repo.insertGuruResponse({
      tenantId: this.ctx.tenantId,
      applicationId,
      response: input.response,
      reason: input.reason ?? null,
      recordedById: this.ctx.user().id,
    });
    await this.audit.record({
      action: 'guru-response.recorded',
      entityType: 'guru_response',
      entityId: record.id,
      applicationId,
      detail: { response: input.response, ...(input.reason ? { reason: input.reason } : {}) },
    });
    await this.events.publish<GuruRespondedPayload>(EVENTS.guruResponded, { applicationId, response: input.response });
    if (input.response === 'DECLINED') {
      await this.events.publish<ApplicationDeclinedPayload>(EVENTS.applicationDeclined, { applicationId, by: 'GURU', reason: input.reason! });
    }
    const now = await this.access.find(applicationId);
    return { applicationId, responseId: record.id, response: input.response, stage: now?.stage ?? app.stage, status: now?.status ?? app.status };
  }

  /** Every answer given on the file, oldest first (for the timeline). */
  history(applicationId: string): Promise<GuruResponseRecord[]> {
    return this.repo.guruResponsesOf(this.ctx.tenantId, [applicationId]);
  }

  /**
   * The answer that counts for the file as it stands. For a file at RECOMMENDED (or later) it is the
   * newest answer given since the president last approved, so an old "wait" is not mistaken for the
   * current answer; for any other stage it is the newest answer overall (a mentor can read why the
   * guru's office asked to wait). `undefined` when there is none.
   */
  async latest(app: { id: string; stage: Stage }): Promise<GuruResponseRecord | undefined> {
    const tenantId = this.ctx.tenantId;
    const [responses, decisions] = await Promise.all([this.repo.guruResponsesOf(tenantId, [app.id]), this.repo.recommendationsOf(tenantId, app.id)]);
    const approvedAt = decisions.find((d) => d.decision === 'APPROVE')?.createdAt;
    const approvedNow = app.stage === 'RECOMMENDED' || app.stage === 'INITIATED';
    const relevant = approvedNow && approvedAt ? responses.filter((r) => r.recordedAt >= approvedAt) : responses;
    return relevant[relevant.length - 1];
  }
}
