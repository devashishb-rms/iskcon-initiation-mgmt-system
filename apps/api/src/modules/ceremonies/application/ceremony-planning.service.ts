import { Injectable } from '@nestjs/common';
import type { CeremonyDto } from '@iskcon/contracts';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { AuditService } from '../../audit';
import { GurusService } from '../../gurus';
import { CeremoniesRepository } from '../infrastructure/ceremonies.repository';
import { CeremonyLookup } from './ceremony-lookup';
import { CeremonyPresenter } from './ceremony.presenter';

/** Planning: create a ceremony, or cancel one that has not happened. */
@Injectable()
export class CeremonyPlanningService {
  constructor(
    private readonly repo: CeremoniesRepository,
    private readonly lookup: CeremonyLookup,
    private readonly presenter: CeremonyPresenter,
    private readonly gurus: GurusService,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
  ) {}

  async create(input: { guruId: string; track: 'FIRST' | 'SECOND'; venue: string; date: string }): Promise<CeremonyDto> {
    await this.gurus.get(input.guruId); // 404 for a guru of another temple
    const ceremony = await this.repo.insert(this.ctx.tenantId, input);
    await this.audit.record({
      action: 'ceremony.created',
      entityType: 'ceremony',
      entityId: ceremony.id,
      detail: { guruId: input.guruId, track: input.track, venue: input.venue, date: input.date },
    });
    return this.presenter.presentOne(ceremony);
  }

  /** PLANNED to CANCELLED. The attendees are detached and stay RECOMMENDED, free for another ceremony. */
  async cancel(id: string): Promise<CeremonyDto> {
    const ceremony = await this.lookup.getPlanned(id);
    const detached = (await this.repo.attendeesOf(this.ctx.tenantId, [id])).map((a) => a.applicationId);
    await this.repo.deleteAttendees(this.ctx.tenantId, id);
    await this.repo.setStatus(this.ctx.tenantId, id, 'CANCELLED');
    await this.audit.record({
      action: 'ceremony.cancelled',
      entityType: 'ceremony',
      entityId: id,
      detail: { date: ceremony.date, detachedApplicationIds: detached },
    });
    return this.presenter.presentOne({ ...ceremony, status: 'CANCELLED' });
  }
}
