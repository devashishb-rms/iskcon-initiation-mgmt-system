import { Injectable } from '@nestjs/common';
import { can } from '@iskcon/contracts';
import { Forbidden, NotFound } from '../../../common/errors';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationAccess, type ApplicationSummary } from '../../../shared/application-ports';
import type { ApplicationWithCandidate } from '../domain/application';
import { CandidatesRepository } from '../infrastructure/candidates.repository';

export const toSummary = (a: ApplicationWithCandidate): ApplicationSummary => ({
  id: a.id,
  candidateId: a.candidateId,
  candidateName: a.candidate.name,
  candidateUserId: a.candidate.userId,
  mentorId: a.candidate.mentorId,
  guruId: a.guruId,
  track: a.track,
  stage: a.stage,
  status: a.status,
});

/**
 * Object-level access: not "may this role read applications" (that is a permission, checked on the
 * route) but "may this person read THIS application". A candidate sees their own file, a mentor
 * sees the files of the people assigned to them, the temple office and the president see all.
 * A file the caller may not see is reported as not found, so its existence is not confirmed.
 */
@Injectable()
export class ApplicationAccessService extends ApplicationAccess {
  constructor(
    private readonly repo: CandidatesRepository,
    private readonly ctx: RequestContextService,
  ) {
    super();
  }

  /** Can the signed-in person see this file? */
  canSee(a: ApplicationWithCandidate): boolean {
    const user = this.ctx.user();
    if (can(user.roles, 'candidate:read:any')) return true;
    if (can(user.roles, 'candidate:read:assigned') && a.candidate.mentorId === user.id) return true;
    if (can(user.roles, 'candidate:read:own') && a.candidate.userId === user.id) return true;
    return false;
  }

  async load(id: string, lock = false): Promise<ApplicationWithCandidate> {
    const a = await this.repo.findApplication(this.ctx.tenantId, id, lock);
    if (!a || !this.canSee(a)) throw new NotFound('Application');
    return a;
  }

  async assertCanRead(applicationId: string): Promise<ApplicationSummary> {
    return toSummary(await this.load(applicationId));
  }

  async assertCanContribute(applicationId: string): Promise<ApplicationSummary> {
    const a = await this.load(applicationId);
    const user = this.ctx.user();
    if (!can(user.roles, 'document:upload') && !can(user.roles, 'note:message')) throw new Forbidden();
    return toSummary(a);
  }

  async find(applicationId: string): Promise<ApplicationSummary | undefined> {
    const a = await this.repo.findApplication(this.ctx.tenantId, applicationId);
    return a ? toSummary(a) : undefined;
  }

  async findMany(applicationIds: string[]): Promise<ApplicationSummary[]> {
    return (await this.repo.findApplications(this.ctx.tenantId, applicationIds)).map(toSummary);
  }
}
