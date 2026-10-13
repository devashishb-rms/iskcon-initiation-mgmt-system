import { Injectable } from '@nestjs/common';
import type { CeremonyDto } from '@iskcon/contracts';
import { Conflict, NotFound, RuleViolation } from '../../../common/errors';
import { Clock } from '../../../platform/clock/clock';
import { EventBus } from '../../../platform/events/event-bus';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationAccess, ApplicationWorkflow, type ApplicationSummary } from '../../../shared/application-ports';
import { EVENTS, type CeremonyCompletedPayload } from '../../../shared/events';
import { AuditService } from '../../audit';
import { RegisterService, type NewRegisterEntry } from '../../register';
import { completionBlock, planCompletion, type Ceremony, type CompletionPlan } from '../domain/ceremony';
import { canBeInitiated } from '../domain/eligibility';
import { CeremoniesRepository } from '../infrastructure/ceremonies.repository';
import { CeremonyLookup } from './ceremony-lookup';
import { CeremonyPresenter } from './ceremony.presenter';

interface PresentAttendee {
  applicationId: string;
  spiritualName: string;
  summary: ApplicationSummary;
}

/**
 * Completing a ceremony is one atomic step (the caller's unit of work): for each person who was
 * present, a register entry is written and the application is moved to INITIATED and closed as
 * COMPLETED; a first initiation also records the date a second one is counted from. Those who did
 * not come are detached and stay RECOMMENDED. Any failure rolls back everything, including the event.
 */
@Injectable()
export class CeremonyCompletionService {
  constructor(
    private readonly repo: CeremoniesRepository,
    private readonly lookup: CeremonyLookup,
    private readonly presenter: CeremonyPresenter,
    private readonly register: RegisterService,
    private readonly applications: ApplicationAccess,
    private readonly workflow: ApplicationWorkflow,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly ctx: RequestContextService,
  ) {}

  async complete(id: string, input: { spiritualNames: Record<string, string> }): Promise<CeremonyDto> {
    const tenantId = this.ctx.tenantId;
    // The row lock makes a second, simultaneous completion wait, then find the status changed.
    const ceremony = await this.lookup.get(id, true);
    this.assertCompletable(ceremony);

    const attendees = await this.repo.attendeesOf(tenantId, [id]);
    const summaries = new Map((await this.applications.findMany(attendees.map((a) => a.applicationId))).map((a) => [a.id, a]));
    const plan = planCompletion(attendees, input.spiritualNames);
    this.assertPlanComplete(plan, summaries);
    const present = this.presentAttendees(plan, summaries);

    // Validation is over; from here every write is part of the one transaction.
    await this.register.createEntries(present.map((p) => this.entryFor(ceremony, p)));
    for (const p of present) {
      await this.workflow.transition(p.applicationId, 'INITIATED');
      await this.workflow.close(p.applicationId, 'COMPLETED');
      if (ceremony.track === 'FIRST') await this.workflow.recordInitiation(p.applicationId, ceremony.date);
    }
    // Absent people leave the list (they stay RECOMMENDED); present people keep the name they were given.
    for (const applicationId of plan.absent) await this.repo.deleteAttendee(tenantId, id, applicationId);
    for (const p of present) await this.repo.updateAttendee(tenantId, id, p.applicationId, { present: true, spiritualName: p.spiritualName });
    await this.repo.setStatus(tenantId, id, 'COMPLETED');

    const applicationIds = present.map((p) => p.applicationId);
    await this.audit.record({
      action: 'ceremony.completed',
      entityType: 'ceremony',
      entityId: id,
      detail: { date: ceremony.date, track: ceremony.track, initiatedApplicationIds: applicationIds, detachedAbsentApplicationIds: plan.absent },
    });
    const payload: CeremonyCompletedPayload = { ceremonyId: id, applicationIds, date: ceremony.date };
    await this.events.publish(EVENTS.ceremonyCompleted, payload);
    return this.presenter.presentOne({ ...ceremony, status: 'COMPLETED' });
  }

  /** Only a planned ceremony whose day has come (`Clock.today()`), once. */
  private assertCompletable(ceremony: Ceremony): void {
    const block = completionBlock(ceremony, this.clock.today());
    if (block === 'NOT_PLANNED') throw new Conflict('CEREMONY_NOT_PLANNED', 'The ceremony is no longer planned', { status: ceremony.status });
    if (block === 'DATE_IN_FUTURE') {
      throw new RuleViolation('VALIDATION_FAILED', 'A ceremony cannot be completed before its date', { date: ceremony.date }, [
        { path: 'date', code: 'DATE_IN_FUTURE', params: { date: ceremony.date } },
      ]);
    }
  }

  /** Refuses, naming people, whatever would otherwise fail halfway through the writes. */
  private assertPlanComplete(plan: CompletionPlan, summaries: Map<string, ApplicationSummary>): void {
    const nameOf = (applicationId: string): string => summaries.get(applicationId)?.candidateName ?? '';
    if (plan.missingNames.length) {
      throw new RuleViolation(
        'VALIDATION_FAILED',
        'A spiritual name is needed for everyone who was present',
        undefined,
        plan.missingNames.map((applicationId) => ({
          path: `spiritualNames.${applicationId}`,
          code: 'SPIRITUAL_NAME_REQUIRED',
          params: { candidateName: nameOf(applicationId) },
        })),
      );
    }
    if (!plan.present.length) {
      throw new RuleViolation('VALIDATION_FAILED', 'Nobody is marked present; cancel the ceremony instead', undefined, [
        { path: 'attendees', code: 'NOBODY_PRESENT' },
      ]);
    }
    // The guru's office may have asked someone to wait since they were listed.
    const notReady = plan.present.map((p) => summaries.get(p.applicationId)).filter((s): s is ApplicationSummary => !!s && !canBeInitiated(s));
    if (notReady.length) {
      throw new RuleViolation(
        'INVALID_STAGE_TRANSITION',
        'Some attendees are no longer at the RECOMMENDED stage; detach them first',
        undefined,
        notReady.map((s) => ({
          path: `attendees.${s.id}`,
          code: 'ATTENDEE_NOT_RECOMMENDED',
          params: { candidateName: s.candidateName, stage: s.stage, status: s.status },
        })),
      );
    }
  }

  /** Those who were present, in a fixed order (by name) so any failure is reproducible. */
  private presentAttendees(plan: CompletionPlan, summaries: Map<string, ApplicationSummary>): PresentAttendee[] {
    return plan.present
      .map((p) => {
        const summary = summaries.get(p.applicationId);
        if (!summary) throw new NotFound('Application');
        return { ...p, summary };
      })
      .sort((a, b) => a.summary.candidateName.localeCompare(b.summary.candidateName) || a.applicationId.localeCompare(b.applicationId));
  }

  private entryFor(ceremony: Ceremony, p: PresentAttendee): NewRegisterEntry {
    return {
      applicationId: p.applicationId,
      candidateName: p.summary.candidateName,
      spiritualName: p.spiritualName,
      track: ceremony.track,
      guruId: ceremony.guruId,
      ceremonyId: ceremony.id,
      initiatedOn: ceremony.date,
    };
  }
}
