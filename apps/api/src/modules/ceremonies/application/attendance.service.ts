import { Injectable } from '@nestjs/common';
import type { CeremonyDto } from '@iskcon/contracts';
import { NotFound } from '../../../common/errors';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { AuditService } from '../../audit';
import { CeremoniesRepository } from '../infrastructure/ceremonies.repository';
import { CeremonyLookup } from './ceremony-lookup';
import { CeremonyPresenter } from './ceremony.presenter';
import { EligibilityService } from './eligibility.service';

/** Who is on a planned ceremony's list: attach, detach, and mark who came. */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly repo: CeremoniesRepository,
    private readonly lookup: CeremonyLookup,
    private readonly presenter: CeremonyPresenter,
    private readonly eligibility: EligibilityService,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
  ) {}

  async attach(ceremonyId: string, applicationId: string): Promise<CeremonyDto> {
    const ceremony = await this.lookup.getPlanned(ceremonyId);
    await this.repo.lockForAttachment(this.ctx.tenantId, applicationId);
    await this.eligibility.assertEligible(ceremony, applicationId);
    await this.repo.insertAttendee(this.ctx.tenantId, ceremonyId, applicationId);
    await this.audit.record({
      action: 'ceremony.attendee-attached',
      entityType: 'ceremony',
      entityId: ceremonyId,
      applicationId,
    });
    return this.presenter.presentOne(ceremony);
  }

  async detach(ceremonyId: string, applicationId: string): Promise<CeremonyDto> {
    const ceremony = await this.lookup.getPlanned(ceremonyId);
    if (!(await this.repo.deleteAttendee(this.ctx.tenantId, ceremonyId, applicationId))) throw new NotFound('Attendee');
    await this.audit.record({
      action: 'ceremony.attendee-detached',
      entityType: 'ceremony',
      entityId: ceremonyId,
      applicationId,
    });
    return this.presenter.presentOne(ceremony);
  }

  /** Records whether the person came, and optionally the spiritual name they were given. */
  async markAttendance(ceremonyId: string, applicationId: string, input: { present: boolean; spiritualName?: string }): Promise<CeremonyDto> {
    const ceremony = await this.lookup.getPlanned(ceremonyId);
    if (!(await this.repo.updateAttendee(this.ctx.tenantId, ceremonyId, applicationId, input))) throw new NotFound('Attendee');
    await this.audit.record({
      action: 'ceremony.attendance-marked',
      entityType: 'ceremony',
      entityId: ceremonyId,
      applicationId,
      detail: { present: input.present },
    });
    return this.presenter.presentOne(ceremony);
  }
}
