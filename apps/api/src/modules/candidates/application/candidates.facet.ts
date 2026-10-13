import { Injectable } from '@nestjs/common';
import { can, type TimelineEvent } from '@iskcon/contracts';
import { ApplicationFacetProvider, type ApplicationFacet, type FacetDetail } from '../../../platform/facets/facets';
import type { ApplicationSummary } from '../../../shared/application-ports';
import { isLocked } from '../domain/stage-machine';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { AuditQueryService } from '../../audit';
import { UsersService } from '../../identity';
import { CandidatesRepository } from '../infrastructure/candidates.repository';

/** What this module adds to the application file: its timeline entries and the actions it offers. */
@Injectable()
@ApplicationFacetProvider()
export class CandidatesFacet implements ApplicationFacet {
  constructor(
    private readonly repo: CandidatesRepository,
    private readonly users: UsersService,
    private readonly auditQuery: AuditQueryService,
    private readonly ctx: RequestContextService,
  ) {}

  async detail(app: ApplicationSummary): Promise<Partial<FacetDetail>> {
    const user = this.ctx.user();
    const open = app.status === 'OPEN';
    const myCandidate = app.mentorId === user.id;
    return {
      actions: {
        canSetPractice: open && can(user.roles, 'application:set-practice') && myCandidate,
        canSetTempleFacts: open && can(user.roles, 'application:set-temple-facts'),
        canAdvance: open && can(user.roles, 'application:advance') && app.track === 'FIRST' && (app.stage === 'ASPIRING' || app.stage === 'SHELTER'),
        canSubmit: open && can(user.roles, 'application:submit') && myCandidate && app.stage === 'PREPARING',
        canChangeGuru: open && can(user.roles, 'application:change-guru') && !isLocked(app.stage),
        canAddMonthlyNote: open && can(user.roles, 'note:monthly') && myCandidate,
        canMessage: open && can(user.roles, 'note:message'),
      },
    };
  }

  async timeline(applicationId: string): Promise<TimelineEvent[]> {
    const tenantId = this.ctx.tenantId;
    const staff = this.ctx.user().roles.some((r) => r !== 'CANDIDATE');
    const [stages, notes, facts] = await Promise.all([
      this.repo.stageEvents(tenantId, applicationId),
      this.repo.notesOf(tenantId, applicationId, staff ? undefined : ['MESSAGE', 'SEND_BACK']),
      this.auditQuery.list({ applicationId, action: 'application.facts-updated' }, 1, 200),
    ]);
    const names = new Map(
      (await this.users.findMany([...stages.map((s) => s.actorId), ...notes.map((n) => n.authorId)].filter((x): x is string => !!x))).map((u) => [u.id, u.name]),
    );
    return [
      ...stages.map<TimelineEvent>((s) => ({
        id: `stage:${s.id}`,
        at: s.at.toISOString(),
        kind: 'STAGE',
        actor: s.actorId ? (names.get(s.actorId) ?? null) : null,
        summary: { code: 'timeline.stage', params: { from: s.fromStage ?? '', to: s.toStage, ...(s.reason ? { reason: s.reason } : {}) } },
      })),
      ...notes.map<TimelineEvent>((n) => ({
        id: `note:${n.id}`,
        at: n.createdAt.toISOString(),
        kind: 'NOTE',
        actor: names.get(n.authorId) ?? null,
        summary: { code: `timeline.note.${n.kind.toLowerCase()}` },
      })),
      ...facts.items.map<TimelineEvent>((f) => ({
        id: `fact:${f.id}`,
        at: f.at,
        kind: 'FACT',
        actor: f.actorName,
        summary: {
          code: 'timeline.facts',
          params: { fields: Object.keys((f.detail as { changes?: Record<string, unknown> } | null)?.changes ?? {}).join(',') },
        },
      })),
    ];
  }
}
