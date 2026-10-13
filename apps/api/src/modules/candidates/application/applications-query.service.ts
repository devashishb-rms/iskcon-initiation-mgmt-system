import { Injectable } from '@nestjs/common';
import { can, type CandidateListQuery, type Page } from '@iskcon/contracts';
import { NotFound } from '../../../common/errors';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationAccessService } from './application-access.service';
import type { ApplicationWithCandidate } from '../domain/application';
import { CandidatesRepository, type ListFilter } from '../infrastructure/candidates.repository';

/**
 * Reads other modules compose into screens. All of them apply the caller's visibility, so a
 * composer cannot accidentally show a mentor someone else's candidate.
 */
@Injectable()
export class ApplicationsQueryService {
  constructor(
    private readonly repo: CandidatesRepository,
    private readonly access: ApplicationAccessService,
    private readonly ctx: RequestContextService,
  ) {}

  /** One application the caller may see (404 otherwise). */
  get(applicationId: string): Promise<ApplicationWithCandidate> {
    return this.access.load(applicationId);
  }

  async mine(): Promise<ApplicationWithCandidate> {
    const id = await this.repo.currentForUser(this.ctx.tenantId, this.ctx.user().id);
    if (!id) throw new NotFound('Application');
    return this.access.load(id);
  }

  /** Other applications of the same person (a first and a second initiation). */
  async siblings(candidateId: string) {
    return this.repo.applicationsOfCandidate(this.ctx.tenantId, candidateId);
  }

  async list(
    query: Partial<CandidateListQuery> & { stages?: ListFilter['stages'] },
    order: 'newest' | 'oldest-in-stage' = 'newest',
  ): Promise<Page<ApplicationWithCandidate>> {
    const user = this.ctx.user();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const scope: Pick<ListFilter, 'scopeMentorId' | 'scopeUserId'> = {};
    if (!can(user.roles, 'candidate:read:any')) {
      if (can(user.roles, 'candidate:read:assigned')) scope.scopeMentorId = user.id;
      else scope.scopeUserId = user.id;
    }
    const { rows, total } = await this.repo.list(
      this.ctx.tenantId,
      {
        q: query.q,
        stage: query.stage,
        status: query.status,
        track: query.track,
        mentorId: query.mentorId,
        guruId: query.guruId,
        stages: query.stages,
        ...scope,
      },
      page,
      pageSize,
      order,
    );
    return { items: rows, page, pageSize, total };
  }
}
