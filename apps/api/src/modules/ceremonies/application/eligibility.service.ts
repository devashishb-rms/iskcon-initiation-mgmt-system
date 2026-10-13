import { Injectable } from '@nestjs/common';
import type { CandidateListQuery } from '@iskcon/contracts';
import { Conflict, NotFound, RuleViolation } from '../../../common/errors';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationAccess, type ApplicationSummary } from '../../../shared/application-ports';
import { ApplicationsQueryService, toSummary } from '../../candidates';
import type { Ceremony } from '../domain/ceremony';
import { ineligibleReasons, type IneligibleReason } from '../domain/eligibility';
import { CeremoniesRepository } from '../infrastructure/ceremonies.repository';
import { GuruResponseReader } from './guru-response.reader';

const PAGE = 200;

/**
 * Decides who may attend a ceremony. The rule itself is pure (`domain/eligibility.ts`); this class
 * gathers what the rule needs from the other modules' public APIs and the guru's latest answer.
 */
@Injectable()
export class EligibilityService {
  constructor(
    private readonly repo: CeremoniesRepository,
    private readonly applications: ApplicationAccess,
    private readonly queries: ApplicationsQueryService,
    private readonly guruResponses: GuruResponseReader,
    private readonly ctx: RequestContextService,
  ) {}

  /** The applications that could be attached to this ceremony now, by candidate name. */
  async eligible(ceremony: Ceremony): Promise<ApplicationSummary[]> {
    // The ceremony's own guru, track, stage and status narrow the search; the rule below is the authority.
    const query: Partial<CandidateListQuery> = { stage: 'RECOMMENDED', status: 'OPEN', guruId: ceremony.guruId, track: ceremony.track };
    const candidates: ApplicationSummary[] = [];
    for (let page = 1; ; page++) {
      const { items, total } = await this.queries.list({ ...query, page, pageSize: PAGE });
      candidates.push(...items.map(toSummary));
      if (page * PAGE >= total) break;
    }
    const attached = await this.repo.attachedToPlanned(this.ctx.tenantId, candidates.map((a) => a.id));
    const out: ApplicationSummary[] = [];
    for (const app of candidates) {
      const reasons = ineligibleReasons({
        application: app,
        ceremony,
        latestGuruResponse: await this.guruResponses.latest(app),
        attachedToPlannedCeremony: attached.has(app.id),
      });
      if (!reasons.length) out.push(app);
    }
    return out.sort((a, b) => a.candidateName.localeCompare(b.candidateName) || a.id.localeCompare(b.id));
  }

  /** Throws unless this application may be attached to this ceremony now; returns it otherwise. */
  async assertEligible(ceremony: Ceremony, applicationId: string): Promise<ApplicationSummary> {
    const app = await this.applications.find(applicationId);
    if (!app) throw new NotFound('Application');
    const attached = await this.repo.attachedToPlanned(this.ctx.tenantId, [applicationId]);
    const reasons = ineligibleReasons({
      application: app,
      ceremony,
      latestGuruResponse: await this.guruResponses.latest(app),
      attachedToPlannedCeremony: attached.has(applicationId),
    });
    if (reasons.length) throw refusal(reasons);
    return app;
  }
}

/** Maps the failed reasons to one error: the first that matters sets the code, all are listed. */
function refusal(reasons: IneligibleReason[]): Error {
  const errors = reasons.map((code) => ({ path: 'applicationId', code }));
  if (reasons.includes('ALREADY_ATTACHED')) return new Conflict('CONFLICT', 'Already attached to a planned ceremony', { reason: 'ALREADY_ATTACHED' });
  if (reasons.length === 1 && reasons[0] === 'GURU_NOT_ACCEPTED') {
    return new RuleViolation('CANDIDATE_NOT_ACCEPTED', "The guru's office has not accepted this candidate", undefined, errors);
  }
  return new RuleViolation('VALIDATION_FAILED', 'This application cannot attend this ceremony', undefined, errors);
}
