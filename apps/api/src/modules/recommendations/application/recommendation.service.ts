import { Injectable } from '@nestjs/common';
import type { ApplicationStatus, DecideBody, Decision, Stage } from '@iskcon/contracts';
import { Conflict, RuleViolation, ValidationFailed } from '../../../common/errors';
import { EventBus } from '../../../platform/events/event-bus';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationWorkflow } from '../../../shared/application-ports';
import {
  EVENTS,
  type ApplicationApprovedPayload,
  type ApplicationDeclinedPayload,
  type ApplicationSentBackPayload,
} from '../../../shared/events';
import { AuditService } from '../../audit';
import { ApplicationsQueryService } from '../../candidates';
import { ChecklistService, type ChecklistResult } from '../../checklist';
import { GurusService } from '../../gurus';
import { canDecide } from '../domain/stage-rules';
import type { DecisionSnapshot } from '../domain/snapshot';
import { DecisionsRepository } from '../infrastructure/decisions.repository';

const AUDIT_ACTION: Record<Decision, string> = {
  APPROVE: 'recommendation.approved',
  SEND_BACK: 'recommendation.sent-back',
  DECLINE: 'recommendation.declined',
};

/** What the president's decision did to the file. The screen re-reads the application for the rest. */
export interface DecisionResult {
  applicationId: string;
  recommendationId: string;
  decision: Decision;
  stage: Stage;
  status: ApplicationStatus;
}

/**
 * The president's decision on a submitted file: approve (a recommendation to the guru's office),
 * send back to the mentor with a reason, or decline. The system never approves anyone: this runs
 * only when the president chooses, and it re-runs the checklist itself; it does not trust what the
 * screen showed.
 *
 * Every decision stores the rule set version it was made under and the checklist as it stood, so the
 * record never changes when the rules do. The caller runs this inside one unit of work: if a check
 * fails after the file was locked, the whole transaction (stage change, audit line, event) is undone.
 */
@Injectable()
export class RecommendationService {
  constructor(
    private readonly queries: ApplicationsQueryService,
    private readonly checklist: ChecklistService,
    private readonly workflow: ApplicationWorkflow,
    private readonly gurus: GurusService,
    private readonly repo: DecisionsRepository,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly ctx: RequestContextService,
  ) {}

  async decide(applicationId: string, body: DecideBody): Promise<DecisionResult> {
    const app = await this.queries.get(applicationId);
    if (!canDecide(app)) {
      throw new Conflict('CONFLICT', 'Only a submitted file that is still open can be decided', { stage: app.stage, status: app.status });
    }
    if (body.decision !== 'APPROVE' && !body.reason) throw new ValidationFailed([{ path: 'reason', code: 'REASON_REQUIRED' }]);

    // Refuse early, without touching anything, when approval is plainly not possible.
    if (body.decision === 'APPROVE') this.assertCanApprove(app.guruId, (await this.checklist.evaluateOne(app)).evaluation.blockers);

    // Act on the file. The workflow takes the row lock first, so two decisions on one file cannot interleave.
    switch (body.decision) {
      case 'APPROVE':
        await this.workflow.transition(applicationId, 'RECOMMENDED');
        break;
      case 'SEND_BACK':
        await this.workflow.transition(applicationId, 'PREPARING', { reason: body.reason });
        await this.workflow.addSendBackNote(applicationId, body.reason!);
        break;
      case 'DECLINE':
        await this.workflow.close(applicationId, 'DECLINED', body.reason);
        break;
    }

    // Judge on what is true now, under the lock (the exceptions or facts may have changed a moment ago).
    const current = await this.queries.get(applicationId);
    const check = await this.checklist.evaluateOne(current);
    if (body.decision === 'APPROVE') this.assertCanApprove(current.guruId, check.evaluation.blockers);

    const record = await this.repo.insertRecommendation({
      tenantId: this.ctx.tenantId,
      applicationId,
      decision: body.decision,
      reason: body.reason ?? null,
      decidedById: this.ctx.user().id,
      ruleSetVersionId: check.ruleVersion.id,
      evaluationSnapshot: await this.snapshotOf(check, current.guruId),
    });
    await this.audit.record({
      action: AUDIT_ACTION[body.decision],
      entityType: 'recommendation',
      entityId: record.id,
      applicationId,
      ruleSetVersionId: check.ruleVersion.id,
      detail: { decision: body.decision, ...(body.reason ? { reason: body.reason } : {}), ruleSet: check.ruleVersion.ruleSetName, version: check.ruleVersion.version },
    });
    await this.publish(applicationId, body);
    return { applicationId, recommendationId: record.id, decision: body.decision, stage: current.stage, status: current.status };
  }

  private assertCanApprove(guruId: string | null, blockers: string[]): void {
    if (!guruId) throw new RuleViolation('APPROVAL_BLOCKED', 'A guru must be chosen before approval', { blockers: '', reason: 'GURU_REQUIRED' });
    if (blockers.length) throw new RuleViolation('APPROVAL_BLOCKED', 'The checklist has open items', { blockers: blockers.join(',') });
  }

  private async snapshotOf(check: ChecklistResult, guruId: string | null): Promise<DecisionSnapshot> {
    const guru = guruId ? await this.gurus.get(guruId) : null;
    return { params: check.params, evaluation: check.evaluation, guru: guru ? { id: guru.id, name: guru.name } : null };
  }

  private async publish(applicationId: string, body: DecideBody): Promise<void> {
    switch (body.decision) {
      case 'APPROVE':
        await this.events.publish<ApplicationApprovedPayload>(EVENTS.applicationApproved, { applicationId });
        break;
      case 'SEND_BACK':
        await this.events.publish<ApplicationSentBackPayload>(EVENTS.applicationSentBack, { applicationId, reason: body.reason! });
        break;
      case 'DECLINE':
        await this.events.publish<ApplicationDeclinedPayload>(EVENTS.applicationDeclined, { applicationId, by: 'PRESIDENT', reason: body.reason! });
        break;
    }
  }
}
