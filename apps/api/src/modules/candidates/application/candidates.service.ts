import { Injectable } from '@nestjs/common';
import {
  can,
  CONSENT_VERSION,
  type CreateCandidateBody,
  type CreateCandidateResponse,
  type NoteDto,
  type NoteKind,
  type Stage,
  type UpdateFactsBody,
} from '@iskcon/contracts';
import { Conflict, Forbidden, NotFound, RuleViolation, ValidationFailed } from '../../../common/errors';
import { Clock } from '../../../platform/clock/clock';
import { EventBus } from '../../../platform/events/event-bus';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { EVENTS } from '../../../shared/events';
import { AuditService } from '../../audit';
import { GurusService } from '../../gurus';
import { UsersService } from '../../identity';
import type { ApplicationWithCandidate } from '../domain/application';
import { FACT_FIELDS, FACT_PERMISSION } from '../domain/fact-fields';
import { canMove, initialStage, isLocked } from '../domain/stage-machine';
import { CandidatesRepository } from '../infrastructure/candidates.repository';
import { ApplicationAccessService } from './application-access.service';
import { ApplicationWorkflowService } from './application-workflow.service';

const DATE_FIELDS: Array<keyof UpdateFactsBody> = [
  'practiceSince',
  'shelterDate',
  'firstInitiationDate',
  'guruChangedOn',
  'returnedOn',
];

/**
 * Commands on candidates and their applications: add a person, record facts, choose the guru, move
 * through the early stages, submit for review, write notes. Each command checks the stage, checks
 * who is asking, changes the record, and writes the audit line in the same transaction.
 */
@Injectable()
export class CandidatesService {
  constructor(
    private readonly repo: CandidatesRepository,
    private readonly access: ApplicationAccessService,
    private readonly workflow: ApplicationWorkflowService,
    private readonly users: UsersService,
    private readonly gurus: GurusService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
  ) {}

  // ───────── adding people ─────────

  async createCandidate(body: CreateCandidateBody): Promise<CreateCandidateResponse> {
    const tenantId = this.ctx.tenantId;
    if (body.consent.version !== CONSENT_VERSION) {
      throw new ValidationFailed([{ path: 'consent.version', code: 'CONSENT_REQUIRED' }]);
    }
    if (body.mentorId) {
      const mentor = await this.users.find(body.mentorId);
      if (!mentor || !mentor.roles.includes('MENTOR') || !mentor.active) {
        throw new ValidationFailed([{ path: 'mentorId', code: 'NOT_A_MENTOR' }]);
      }
    }
    if (body.guruId) await this.gurus.get(body.guruId);

    const login = body.createLogin
      ? await this.users.create({ name: body.name, email: body.email, phone: body.phone, roles: ['CANDIDATE'] })
      : undefined;

    const candidate = await this.repo.insertCandidate({
      tenantId,
      userId: login?.id ?? null,
      name: body.name.trim(),
      phone: login?.phone ?? body.phone ?? null,
      email: login?.email ?? body.email ?? null,
      groupName: body.groupName?.trim() || null,
      mentorId: body.mentorId ?? null,
      consentAt: this.clock.now(),
      consentVersion: body.consent.version,
    });
    const application = await this.openApplication(candidate.id, body.track, body.guruId ?? null);

    await this.audit.record({
      action: 'candidate.created',
      entityType: 'candidate',
      entityId: candidate.id,
      applicationId: application.id,
      detail: { track: body.track, consentVersion: body.consent.version, login: Boolean(login) },
    });
    await this.events.publish(EVENTS.candidateCreated, { candidateId: candidate.id, applicationId: application.id });
    return { candidateId: candidate.id, applicationId: application.id };
  }

  /** A second initiation: allowed once the first is complete and nothing else is open. */
  async createSecondApplication(candidateId: string, guruId?: string): Promise<{ applicationId: string }> {
    const tenantId = this.ctx.tenantId;
    const candidate = await this.repo.findCandidate(tenantId, candidateId);
    if (!candidate) throw new NotFound('Candidate');
    const existing = await this.repo.applicationsOfCandidate(tenantId, candidateId);
    if (existing.some((a) => a.status === 'OPEN')) {
      throw new Conflict('CONFLICT', 'This person already has an open application');
    }
    const first = existing.find((a) => a.track === 'FIRST' && a.status === 'COMPLETED');
    if (!first) throw new RuleViolation('INVALID_STAGE_TRANSITION', 'The first initiation must be completed first');
    if (existing.some((a) => a.track === 'SECOND' && a.status === 'COMPLETED')) {
      throw new Conflict('CONFLICT', 'A second initiation is already complete');
    }
    const chosen = guruId ?? first.guruId;
    if (guruId) await this.gurus.get(guruId);
    const app = await this.openApplication(candidateId, 'SECOND', chosen ?? null, first.firstInitiationDate);
    await this.audit.record({
      action: 'application.second-opened',
      entityType: 'application',
      entityId: app.id,
      applicationId: app.id,
      detail: { candidateId },
    });
    return { applicationId: app.id };
  }

  private async openApplication(candidateId: string, track: 'FIRST' | 'SECOND', guruId: string | null, firstInitiationDate: string | null = null) {
    const stage = initialStage(track);
    const app = await this.repo.insertApplication({
      tenantId: this.ctx.tenantId,
      candidateId,
      track,
      stage,
      stageSince: this.clock.now(),
      guruId,
      firstInitiationDate,
    });
    await this.repo.insertStageEvent({
      tenantId: this.ctx.tenantId,
      applicationId: app.id,
      fromStage: null,
      toStage: stage,
      actorId: this.ctx.current().user?.id ?? null,
      reason: null,
    });
    return app;
  }

  // ───────── facts ─────────

  /** Each field has its own permission; one forbidden field refuses the whole request. */
  async updateFacts(applicationId: string, patch: UpdateFactsBody): Promise<void> {
    const user = this.ctx.user();
    const a = await this.access.load(applicationId, true);
    this.assertOpen(a);

    const keys = FACT_FIELDS.filter((k) => patch[k] !== undefined);
    for (const k of keys) {
      if (!can(user.roles, FACT_PERMISSION[k])) throw new Forbidden(`You may not change ${k}`);
    }
    const today = this.clock.today();
    const problems = DATE_FIELDS.filter((k) => keys.includes(k) && typeof patch[k] === 'string' && (patch[k] as string) > today).map(
      (k) => ({ path: k, code: 'DATE_IN_FUTURE' }),
    );
    if (problems.length) throw new ValidationFailed(problems);

    const changes: Record<string, [unknown, unknown]> = {};
    const set: Record<string, unknown> = {};
    for (const k of keys) {
      const before = a[k] ?? null;
      const after = patch[k] ?? null;
      if (before !== after) {
        changes[k] = [before, after];
        set[k] = after;
      }
    }
    if (!Object.keys(changes).length) return;
    await this.repo.updateApplication(this.ctx.tenantId, applicationId, set);
    await this.audit.record({
      action: 'application.facts-updated',
      entityType: 'application',
      entityId: applicationId,
      applicationId,
      detail: { changes },
    });
  }

  async changeGuru(applicationId: string, guruId: string | null): Promise<void> {
    const a = await this.access.load(applicationId, true);
    this.assertOpen(a);
    if (isLocked(a.stage)) {
      throw new Conflict('CONFLICT', 'The guru cannot be changed once the file is with the president', { stage: a.stage });
    }
    if (guruId) await this.gurus.get(guruId);
    if (a.guruId === guruId) return;
    const set: Record<string, unknown> = { guruId };
    // Moving from one guru to another (not the first choice) starts the clock of rule R-7.
    if (a.guruId && guruId) set.guruChangedOn = this.clock.today();
    await this.repo.updateApplication(this.ctx.tenantId, applicationId, set);
    await this.audit.record({
      action: 'application.guru-changed',
      entityType: 'application',
      entityId: applicationId,
      applicationId,
      detail: { from: a.guruId, to: guruId },
    });
  }

  // ───────── early stages ─────────

  async advance(applicationId: string, to: 'SHELTER' | 'PREPARING', shelterDate?: string, reason?: string): Promise<void> {
    const a = await this.access.load(applicationId, true);
    this.assertOpen(a);
    if (!canMove(a.stage, to)) {
      throw new RuleViolation('INVALID_STAGE_TRANSITION', `Cannot move from ${a.stage} to ${to}`, { from: a.stage, to });
    }
    if (to === 'SHELTER') {
      const date = shelterDate ?? a.shelterDate;
      if (!date) throw new ValidationFailed([{ path: 'shelterDate', code: 'SHELTER_DATE_REQUIRED' }]);
      if (date > this.clock.today()) throw new ValidationFailed([{ path: 'shelterDate', code: 'DATE_IN_FUTURE' }]);
      if (date !== a.shelterDate) {
        await this.repo.updateApplication(this.ctx.tenantId, applicationId, { shelterDate: date });
        await this.audit.record({
          action: 'application.facts-updated',
          entityType: 'application',
          entityId: applicationId,
          applicationId,
          detail: { changes: { shelterDate: [a.shelterDate, date] } },
        });
      }
    }
    await this.workflow.transition(applicationId, to, { reason });
  }

  /** The mentor's readiness note sends the file to the president's queue. */
  async submit(applicationId: string, readinessNote: string): Promise<void> {
    const user = this.ctx.user();
    const a = await this.access.load(applicationId, true);
    this.assertOpen(a);
    if (a.candidate.mentorId !== user.id) throw new Forbidden('Only the candidate\'s own mentor can submit');
    if (a.stage !== 'PREPARING') {
      throw new RuleViolation('INVALID_STAGE_TRANSITION', `Cannot submit from ${a.stage}`, { from: a.stage, to: 'APPLIED' });
    }
    if (!a.guruId) throw new ValidationFailed([{ path: 'guruId', code: 'GURU_REQUIRED' }]);
    await this.repo.insertNote({ tenantId: this.ctx.tenantId, applicationId, kind: 'READINESS', body: readinessNote, authorId: user.id });
    await this.workflow.transition(applicationId, 'APPLIED');
    await this.events.publish(EVENTS.applicationSubmitted, { applicationId });
  }

  // ───────── notes ─────────

  /** Candidates never see the mentor's private notes (monthly and readiness). */
  private visibleKinds(): NoteKind[] | undefined {
    const roles = this.ctx.user().roles;
    const staff = roles.some((r) => r !== 'CANDIDATE');
    return staff ? undefined : ['MESSAGE', 'SEND_BACK'];
  }

  async listNotes(applicationId: string): Promise<NoteDto[]> {
    await this.access.load(applicationId);
    return this.toDtos(await this.repo.notesOf(this.ctx.tenantId, applicationId, this.visibleKinds()));
  }

  async addNote(applicationId: string, kind: 'MONTHLY' | 'MESSAGE', body: string): Promise<NoteDto> {
    const user = this.ctx.user();
    const a = await this.access.load(applicationId);
    this.assertOpen(a);
    if (kind === 'MONTHLY') {
      if (!can(user.roles, 'note:monthly')) throw new Forbidden();
      if (a.candidate.mentorId !== user.id) throw new Forbidden('Only the candidate\'s own mentor writes monthly notes');
    } else if (!can(user.roles, 'note:message')) {
      throw new Forbidden();
    }
    const row = await this.repo.insertNote({ tenantId: this.ctx.tenantId, applicationId, kind, body, authorId: user.id });
    await this.audit.record({
      action: 'note.created',
      entityType: 'note',
      entityId: row.id,
      applicationId,
      detail: { kind },
    });
    return (await this.toDtos([row]))[0]!;
  }

  async toDtos(rows: Array<{ id: string; kind: NoteKind; body: string; authorId: string; createdAt: Date }>): Promise<NoteDto[]> {
    const people = await this.users.findMany(rows.map((r) => r.authorId));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      body: r.body,
      author: { id: r.authorId, name: people.find((p) => p.id === r.authorId)?.name ?? 'Unknown' },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private assertOpen(a: ApplicationWithCandidate): void {
    if (a.status !== 'OPEN') throw new Conflict('CONFLICT', 'This application is closed', { status: a.status });
  }
}

export type { Stage };
