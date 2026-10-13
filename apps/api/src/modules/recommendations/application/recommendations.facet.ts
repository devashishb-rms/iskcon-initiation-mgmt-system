import { Injectable } from '@nestjs/common';
import { can, type ApplicationActions, type GuruResponseDto, type RecommendationDto, type TimelineEvent } from '@iskcon/contracts';
import type { RecordedException, RuleId } from '@iskcon/rules-engine';
import { ApplicationFacetProvider, type ApplicationFacet, type EvidencePart, type FacetDetail } from '../../../platform/facets/facets';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import type { ApplicationSummary } from '../../../shared/application-ports';
import { AuditQueryService } from '../../audit';
import { UsersService } from '../../identity';
import { RuleSetsService } from '../../rules';
import { canDecide, canExportPackage, canRecordException, canRecordGuruResponse } from '../domain/stage-rules';
import { DecisionsRepository, type GuruResponseRecord, type RecommendationRecord } from '../infrastructure/decisions.repository';
import { ExceptionsRepository } from '../infrastructure/exceptions.repository';
import { PackageExportsRepository } from '../infrastructure/package-exports.repository';
import { ExceptionsService } from './exceptions.service';
import { GuruResponseService } from './guru-response.service';

/**
 * What this module adds to the application file: committee exceptions as checklist evidence, the
 * exceptions, latest recommendation and latest guru answer on the detail screen, the actions the caller
 * may take, and its timeline entries. The checklist and the detail screen ask for these through the
 * facet registry; nothing imports this module for them.
 */
@Injectable()
@ApplicationFacetProvider()
export class RecommendationsFacet implements ApplicationFacet {
  constructor(
    private readonly exceptionRows: ExceptionsRepository,
    private readonly exceptions: ExceptionsService,
    private readonly decisions: DecisionsRepository,
    private readonly guruResponses: GuruResponseService,
    private readonly exports: PackageExportsRepository,
    private readonly rules: RuleSetsService,
    private readonly users: UsersService,
    private readonly auditQuery: AuditQueryService,
    private readonly ctx: RequestContextService,
  ) {}

  async evidence(applicationIds: string[]): Promise<EvidencePart> {
    const rows = await this.exceptionRows.listByApplications(this.ctx.tenantId, applicationIds);
    const exceptions = new Map<string, RecordedException[]>();
    for (const r of rows) exceptions.set(r.applicationId, [...(exceptions.get(r.applicationId) ?? []), { ruleId: r.ruleId as RuleId, reason: r.reason }]);
    return { exceptions };
  }

  async detail(app: ApplicationSummary): Promise<Partial<FacetDetail>> {
    const tenantId = this.ctx.tenantId;
    const [exceptions, latest, guru] = await Promise.all([
      this.exceptions.list(app.id),
      this.decisions.latestRecommendation(tenantId, app.id),
      this.guruResponses.latest(app),
    ]);
    const roles = this.ctx.current().user?.roles ?? []; // no actions for system work (event handlers, schedulers)
    const actions: Partial<ApplicationActions> = {
      canRecordException: can(roles, 'exception:record') && canRecordException(app),
      canDecide: can(roles, 'recommendation:decide') && canDecide(app),
      canRecordGuruResponse: can(roles, 'guru-response:record') && canRecordGuruResponse(app),
      canExportPackage: can(roles, 'package:export') && canExportPackage(app),
    };
    return {
      exceptions,
      latestRecommendation: latest ? await this.recommendationDto(latest) : null,
      latestGuruResponse: guru ? await this.guruResponseDto(guru) : null,
      actions,
    };
  }

  async timeline(applicationId: string): Promise<TimelineEvent[]> {
    const tenantId = this.ctx.tenantId;
    const staff = can(this.ctx.current().user?.roles ?? [], 'package:export');
    const [exceptions, removed, recommendations, responses, exports] = await Promise.all([
      this.exceptionRows.listByApplications(tenantId, [applicationId]),
      this.auditQuery.list({ applicationId, action: 'exception.removed' }, 1, 200),
      this.decisions.recommendationsOf(tenantId, applicationId),
      this.guruResponses.history(applicationId),
      staff ? this.exports.listByApplication(tenantId, applicationId) : Promise.resolve([]),
    ]);
    const names = new Map(
      (await this.users.findMany([...exceptions.map((e) => e.createdById), ...recommendations.map((r) => r.decidedById), ...responses.map((r) => r.recordedById), ...exports.map((e) => e.exportedById)])).map((u) => [u.id, u.name]),
    );
    const name = (id: string) => names.get(id) ?? null;
    return [
      ...exceptions.map<TimelineEvent>((e) => ({
        id: `exception:${e.applicationId}:${e.ruleId}`,
        at: e.createdAt.toISOString(),
        kind: 'EXCEPTION',
        actor: name(e.createdById),
        summary: { code: 'timeline.exception.recorded', params: { ruleId: e.ruleId, reason: e.reason } },
      })),
      ...removed.items.map<TimelineEvent>((e) => ({
        id: `exception-removed:${e.id}`,
        at: e.at,
        kind: 'EXCEPTION',
        actor: e.actorName,
        summary: { code: 'timeline.exception.removed', params: { ruleId: String((e.detail as { ruleId?: string } | null)?.ruleId ?? '') } },
      })),
      ...recommendations.map<TimelineEvent>((r) => ({
        id: `recommendation:${r.id}`,
        at: r.createdAt.toISOString(),
        kind: 'RECOMMENDATION',
        actor: name(r.decidedById),
        summary: { code: `timeline.recommendation.${r.decision.toLowerCase()}`, ...(r.reason ? { params: { reason: r.reason } } : {}) },
        ruleSetVersionId: r.ruleSetVersionId,
      })),
      ...responses.map<TimelineEvent>((r) => ({
        id: `guru-response:${r.id}`,
        at: r.recordedAt.toISOString(),
        kind: 'GURU_RESPONSE',
        actor: name(r.recordedById),
        summary: { code: `timeline.guruResponse.${r.response.toLowerCase()}`, ...(r.reason ? { params: { reason: r.reason } } : {}) },
      })),
      ...exports.map<TimelineEvent>((x) => ({
        id: `package:${x.id}`,
        at: x.createdAt.toISOString(),
        kind: 'PACKAGE',
        actor: name(x.exportedById),
        summary: { code: 'timeline.package.exported', params: { missing: x.missingDocuments.length } },
      })),
    ];
  }

  private async recommendationDto(r: RecommendationRecord): Promise<RecommendationDto> {
    const [people, refs] = await Promise.all([this.users.findMany([r.decidedById]), this.rules.refsFor([r.ruleSetVersionId])]);
    const ref = refs.get(r.ruleSetVersionId);
    return {
      id: r.id,
      decision: r.decision,
      reason: r.reason,
      decidedBy: people[0]?.name ?? 'Unknown',
      decidedAt: r.createdAt.toISOString(),
      ruleVersion: ref ?? { id: r.ruleSetVersionId, ruleSetId: r.ruleSetVersionId, ruleSetName: '', version: 0 },
    };
  }

  private async guruResponseDto(r: GuruResponseRecord): Promise<GuruResponseDto> {
    const people = await this.users.findMany([r.recordedById]);
    return { id: r.id, response: r.response, reason: r.reason, recordedBy: people[0]?.name ?? 'Unknown', recordedAt: r.recordedAt.toISOString() };
  }
}
