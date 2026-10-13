import { Injectable } from '@nestjs/common';
import { checkAgainstFloor, GBC_FLOOR, type ParamIssue, type RuleParams } from '@iskcon/rules-engine';
import type { RuleFloorResponse, RuleSetDto, RuleVersionDto, RuleVersionRef } from '@iskcon/contracts';
import { Clock } from '../../../platform/clock/clock';
import { Conflict, NotFound, RuleViolation } from '../../../common/errors';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { AuditService } from '../../audit';
import { GurusService } from '../../gurus';
import { UsersService } from '../../identity';
import { diffParams, mergeWithFloor } from '../domain/params';
import { RuleSetsRepository, type RuleSetRow, type RuleVersionRow } from '../infrastructure/rule-sets.repository';

/** What the checklist runs against for one guru today. */
export interface ResolvedRules {
  ref: RuleVersionRef;
  /** The parameters in force: the version's own values lifted to at least the temple baseline. */
  params: RuleParams;
}

const BASELINE_NAME = 'GBC baseline';

@Injectable()
export class RuleSetsService {
  constructor(
    private readonly repo: RuleSetsRepository,
    private readonly gurus: GurusService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
  ) {}

  // ───────────── reading ─────────────

  /** Creates the baseline rule set (GBC minimums, version 1) the first time it is needed. */
  async ensureBaseline(): Promise<RuleSetRow> {
    const tenantId = this.ctx.tenantId;
    const existing = await this.repo.findForGuru(tenantId, null);
    if (existing) return existing;
    const set = await this.repo.insertSet(tenantId, null, BASELINE_NAME);
    if (!(await this.repo.currentPublished(tenantId, set.id))) {
      await this.repo.insertVersion({
        tenantId,
        ruleSetId: set.id,
        version: 1,
        status: 'PUBLISHED',
        params: { ...GBC_FLOOR, requiredDocuments: [] },
        note: 'GBC minimums',
        createdById: this.ctx.current().user?.id ?? (await this.systemUserId()),
        publishedAt: this.clock.now(),
      });
    }
    return set;
  }

  /** The user a version is attributed to when the system itself creates it (first start). */
  private async systemUserId(): Promise<string> {
    const [admin] = await this.users.listByRole('ADMIN');
    if (!admin) throw new Conflict('CONFLICT', 'Create the first administrator before rule sets exist');
    return admin.id;
  }

  async baselineParams(): Promise<RuleParams> {
    const set = await this.ensureBaseline();
    const current = await this.repo.currentPublished(this.ctx.tenantId, set.id);
    return mergeWithFloor(current!.params, GBC_FLOOR);
  }

  async floor(): Promise<RuleFloorResponse> {
    return { floor: { ...GBC_FLOOR, requiredDocuments: [] }, baseline: await this.baselineParams() };
  }

  async list(): Promise<RuleSetDto[]> {
    await this.ensureBaseline();
    const tenantId = this.ctx.tenantId;
    const sets = await this.repo.listSets(tenantId);
    const versions = await this.repo.versionsOf(tenantId, sets.map((s) => s.id));
    const gurus = await this.gurus.findMany(sets.flatMap((s) => (s.guruId ? [s.guruId] : [])));
    const people = await this.users.findMany([...new Set(versions.map((v) => v.createdById))]);
    const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'System';
    const dto = (set: RuleSetRow): RuleSetDto => {
      const mine = versions.filter((v) => v.ruleSetId === set.id).map((v) => this.toVersionDto(v, nameOf(v.createdById)));
      const guru = set.guruId ? gurus.find((g) => g.id === set.guruId) : undefined;
      return {
        id: set.id,
        name: set.name,
        guru: guru ? { id: guru.id, name: guru.name } : null,
        isBaseline: set.guruId === null,
        current: mine.find((v) => v.status === 'PUBLISHED') ?? null,
        draft: mine.find((v) => v.status === 'DRAFT') ?? null,
        versions: mine,
      };
    };
    return sets.map(dto).sort((a, b) => Number(b.isBaseline) - Number(a.isBaseline) || a.name.localeCompare(b.name));
  }

  async get(setId: string): Promise<RuleSetDto> {
    const found = (await this.list()).find((s) => s.id === setId);
    if (!found) throw new NotFound('Rule set');
    return found;
  }

  /**
   * Which rules apply to a guru's candidates today. A guru without a published rule set of their own
   * is checked against the temple baseline.
   */
  async resolveFor(guruId: string | null): Promise<ResolvedRules> {
    const tenantId = this.ctx.tenantId;
    const baselineSet = await this.ensureBaseline();
    const baselineVersion = (await this.repo.currentPublished(tenantId, baselineSet.id))!;
    const baseline = mergeWithFloor(baselineVersion.params, GBC_FLOOR);

    if (guruId) {
      const own = await this.repo.findForGuru(tenantId, guruId);
      const version = own ? await this.repo.currentPublished(tenantId, own.id) : undefined;
      if (own && version) {
        return {
          ref: { id: version.id, ruleSetId: own.id, ruleSetName: own.name, version: version.version },
          params: mergeWithFloor(version.params, baseline),
        };
      }
    }
    return {
      ref: { id: baselineVersion.id, ruleSetId: baselineSet.id, ruleSetName: baselineSet.name, version: baselineVersion.version },
      params: baseline,
    };
  }

  /** References for versions that were used in past decisions, so history shows what applied then. */
  async refsFor(versionIds: string[]): Promise<Map<string, RuleVersionRef>> {
    const tenantId = this.ctx.tenantId;
    const versions = await this.repo.findVersions(tenantId, [...new Set(versionIds)]);
    const sets = await this.repo.listSets(tenantId);
    return new Map(
      versions.map((v) => [
        v.id,
        { id: v.id, ruleSetId: v.ruleSetId, ruleSetName: sets.find((s) => s.id === v.ruleSetId)?.name ?? '', version: v.version },
      ]),
    );
  }

  // ───────────── changing ─────────────

  /** A guru's office gets its own rule set, starting as a draft copy of the baseline. */
  async createForGuru(guruId: string): Promise<RuleSetDto> {
    const tenantId = this.ctx.tenantId;
    const guru = await this.gurus.get(guruId);
    if (await this.repo.findForGuru(tenantId, guruId)) {
      throw new Conflict('CONFLICT', 'This guru already has a rule set', { field: 'guruId' });
    }
    const set = await this.repo.insertSet(tenantId, guruId, `${guru.name} office rules`);
    await this.repo.insertVersion({
      tenantId,
      ruleSetId: set.id,
      version: 1,
      status: 'DRAFT',
      params: await this.baselineParams(),
      note: 'Started from the temple baseline',
      createdById: this.ctx.user().id,
    });
    await this.audit.record({ action: 'ruleset.created', entityType: 'rule_set', entityId: set.id, detail: { guruId } });
    return this.get(set.id);
  }

  async saveDraft(setId: string, params: RuleParams, note: string | null): Promise<RuleSetDto> {
    const tenantId = this.ctx.tenantId;
    const set = await this.mustFind(setId);
    await this.assertAtOrAboveFloor(set, params);
    const draft = await this.repo.draftOf(tenantId, setId);
    if (draft) {
      await this.repo.updateDraft(tenantId, draft.id, params, note);
    } else {
      await this.repo.insertVersion({
        tenantId,
        ruleSetId: setId,
        version: await this.repo.nextVersionNumber(setId),
        status: 'DRAFT',
        params,
        note,
        createdById: this.ctx.user().id,
      });
    }
    await this.audit.record({ action: 'ruleset.draft-saved', entityType: 'rule_set', entityId: setId });
    return this.get(setId);
  }

  async publish(setId: string): Promise<RuleSetDto> {
    const tenantId = this.ctx.tenantId;
    const set = await this.mustFind(setId);
    const draft = await this.repo.draftOf(tenantId, setId);
    if (!draft) throw new RuleViolation('RULESET_NO_DRAFT', 'There is no draft to publish');
    await this.assertAtOrAboveFloor(set, draft.params);
    const previous = await this.repo.currentPublished(tenantId, setId);
    await this.repo.publish(tenantId, draft.id, this.clock.now());
    await this.audit.record({
      action: 'ruleset.published',
      entityType: 'rule_set',
      entityId: setId,
      ruleSetVersionId: draft.id,
      detail: { version: draft.version, changed: diffParams(previous?.params, draft.params) },
    });
    return this.get(setId);
  }

  async discardDraft(setId: string): Promise<void> {
    const tenantId = this.ctx.tenantId;
    await this.mustFind(setId);
    const draft = await this.repo.draftOf(tenantId, setId);
    if (!draft) throw new RuleViolation('RULESET_NO_DRAFT', 'There is no draft to discard');
    await this.repo.deleteDraft(tenantId, draft.id);
    await this.audit.record({ action: 'ruleset.draft-discarded', entityType: 'rule_set', entityId: setId });
  }

  // ───────────── helpers ─────────────

  private async mustFind(setId: string): Promise<RuleSetRow> {
    await this.ensureBaseline();
    const set = await this.repo.findSet(this.ctx.tenantId, setId);
    if (!set) throw new NotFound('Rule set');
    return set;
  }

  /** The baseline is held to the GBC floor; a guru's set is held to the temple baseline. */
  private async assertAtOrAboveFloor(set: RuleSetRow, params: RuleParams): Promise<void> {
    const floor = set.guruId === null ? { ...GBC_FLOOR, requiredDocuments: [] } : await this.baselineParams();
    const issues: ParamIssue[] = checkAgainstFloor(params, floor);
    if (issues.length) {
      throw new RuleViolation(
        'RULE_BELOW_FLOOR',
        'The values are below the minimum',
        undefined,
        issues.map((i) => ({ path: i.field, code: i.code, params: i.params })),
      );
    }
  }

  private toVersionDto(v: RuleVersionRow, createdBy: string): RuleVersionDto {
    return {
      id: v.id,
      version: v.version,
      status: v.status,
      params: v.params,
      note: v.note,
      createdBy,
      createdAt: v.createdAt.toISOString(),
      publishedAt: v.publishedAt?.toISOString() ?? null,
    };
  }
}
