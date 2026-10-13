import { Injectable } from '@nestjs/common';
import type {
  ApplicationActions,
  ApplicationDetail,
  CandidateListItem,
  CandidateListQuery,
  Page,
  ReviewQueueItem,
  TimelineEvent,
} from '@iskcon/contracts';
import { Clock } from '../../../platform/clock/clock';
import { FacetRegistry } from '../../../platform/facets/facets';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ChecklistService, type ChecklistResult } from '../../checklist';
import { ApplicationsQueryService, toSummary, type ApplicationWithCandidate } from '../../candidates';
import { GurusService } from '../../gurus';
import { UsersService } from '../../identity';
import { isWaitingOnMentor } from '../domain/mentor-steps';

const NO_ACTIONS: ApplicationActions = {
  canSetPractice: false,
  canSetTempleFacts: false,
  canAdvance: false,
  canSubmit: false,
  canChangeGuru: false,
  canRecordException: false,
  canDecide: false,
  canRecordGuruResponse: false,
  canExportPackage: false,
  canUpload: false,
  canAddMonthlyNote: false,
  canMessage: false,
  approveBlockedBy: [],
};

/**
 * Builds the read models the screens show. It owns no tables: it asks the modules that do and
 * assembles their answers. Nothing here changes data.
 */
@Injectable()
export class ApplicationViewService {
  constructor(
    private readonly queries: ApplicationsQueryService,
    private readonly checklist: ChecklistService,
    private readonly facets: FacetRegistry,
    private readonly users: UsersService,
    private readonly gurus: GurusService,
    private readonly clock: Clock,
    private readonly ctx: RequestContextService,
  ) {}

  async detail(applicationId: string): Promise<ApplicationDetail> {
    return this.compose(await this.queries.get(applicationId));
  }

  async mine(): Promise<ApplicationDetail> {
    return this.compose(await this.queries.mine());
  }

  private async compose(a: ApplicationWithCandidate): Promise<ApplicationDetail> {
    const [check, facet, siblings, names] = await Promise.all([
      this.checklist.evaluateOne(a),
      this.facets.detail(toSummary(a)),
      this.queries.siblings(a.candidateId),
      this.nameLookup([a]),
    ]);
    const { evaluation } = check;
    return {
      applicationId: a.id,
      candidate: {
        id: a.candidate.id,
        name: a.candidate.name,
        phone: a.candidate.phone,
        email: a.candidate.email,
        groupName: a.candidate.groupName,
        consentAt: a.candidate.consentAt.toISOString(),
        otherApplications: siblings
          .filter((s) => s.id !== a.id)
          .map((s) => ({ applicationId: s.id, track: s.track, stage: s.stage, status: s.status })),
      },
      track: a.track,
      stage: a.stage,
      stageSince: a.stageSince.toISOString(),
      status: a.status,
      mentor: names.mentor(a),
      guru: names.guru(a),
      facts: {
        practiceSince: a.practiceSince,
        shelterDate: a.shelterDate,
        examStatus: a.examStatus,
        courseComplete: a.courseComplete,
        firstInitiationDate: a.firstInitiationDate,
        guruChangedOn: a.guruChangedOn,
        returnedOn: a.returnedOn,
      },
      evaluation,
      nextStep: check.nextStep,
      ruleVersion: check.ruleVersion,
      documents: facet.documents,
      exceptions: facet.exceptions,
      latestRecommendation: facet.latestRecommendation,
      latestGuruResponse: facet.latestGuruResponse,
      actions: {
        ...NO_ACTIONS,
        ...facet.actions,
        approveBlockedBy: a.stage === 'APPLIED' && a.status === 'OPEN' ? evaluation.blockers : [],
      },
    };
  }

  async timeline(applicationId: string): Promise<TimelineEvent[]> {
    await this.queries.get(applicationId); // visibility check
    return (await this.facets.timeline(applicationId)).sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id));
  }

  // ───────── lists ─────────

  async list(query: CandidateListQuery): Promise<Page<CandidateListItem>> {
    if (query.waitingOnMentor) return this.listWaitingOnMentor(query);
    const page = await this.queries.list(query);
    return { ...page, items: await this.toItems(page.items) };
  }

  /** The mentor's "needs me" filter depends on the checklist, so it is applied after evaluation. */
  private async listWaitingOnMentor(query: CandidateListQuery): Promise<Page<CandidateListItem>> {
    const all = await this.queries.list({ ...query, page: 1, pageSize: 500, status: query.status ?? 'OPEN' });
    const checks = await this.checklist.evaluateMany(all.items);
    const waiting = all.items.filter((a) => isWaitingOnMentor(a.stage, checks.get(a.id)!.evaluation, checks.get(a.id)!.nextStep));
    const start = (query.page - 1) * query.pageSize;
    const slice = waiting.slice(start, start + query.pageSize);
    return { items: await this.toItems(slice, checks), page: query.page, pageSize: query.pageSize, total: waiting.length };
  }

  /** The president's queue: files waiting for a decision, longest wait first. */
  async reviewQueue(page: number, pageSize: number): Promise<Page<ReviewQueueItem>> {
    const result = await this.queries.list({ page, pageSize, status: 'OPEN', stage: 'APPLIED' }, 'oldest-in-stage');
    const checks = await this.checklist.evaluateMany(result.items);
    const items = await this.toItems(result.items, checks);
    const now = this.clock.now().getTime();
    return {
      ...result,
      items: items.map((item, i) => {
        const a = result.items[i]!;
        const c = checks.get(a.id)!;
        return {
          ...item,
          waitingDays: Math.max(0, Math.floor((now - a.stageSince.getTime()) / 86_400_000)),
          ruleVersionLabel: `${c.ruleVersion.ruleSetName} v${c.ruleVersion.version}`,
          missingDocuments: c.evaluation.missingDocuments,
          canApprove: c.evaluation.canApprove,
        };
      }),
    };
  }

  private async toItems(apps: ApplicationWithCandidate[], known?: Map<string, ChecklistResult>): Promise<CandidateListItem[]> {
    const checks = known ?? (await this.checklist.evaluateMany(apps));
    const names = await this.nameLookup(apps);
    return apps.map((a) => {
      const c = checks.get(a.id)!;
      return {
        candidateId: a.candidateId,
        applicationId: a.id,
        name: a.candidate.name,
        groupName: a.candidate.groupName,
        track: a.track,
        stage: a.stage,
        stageSince: a.stageSince.toISOString(),
        status: a.status,
        mentor: names.mentor(a),
        guru: names.guru(a),
        checklist: { met: c.evaluation.summary.met, total: c.evaluation.summary.total, worst: c.evaluation.worst },
        nextStep: c.nextStep,
      };
    });
  }

  private async nameLookup(apps: ApplicationWithCandidate[]) {
    const mentorIds = apps.flatMap((a) => (a.candidate.mentorId ? [a.candidate.mentorId] : []));
    const guruIds = apps.flatMap((a) => (a.guruId ? [a.guruId] : []));
    const [mentors, gurus] = await Promise.all([this.users.findMany(mentorIds), this.gurus.findMany(guruIds)]);
    return {
      mentor: (a: ApplicationWithCandidate) => {
        const m = mentors.find((u) => u.id === a.candidate.mentorId);
        return m ? { id: m.id, name: m.name } : null;
      },
      guru: (a: ApplicationWithCandidate) => {
        const g = gurus.find((x) => x.id === a.guruId);
        return g ? { id: g.id, name: g.name } : null;
      },
    };
  }
}
