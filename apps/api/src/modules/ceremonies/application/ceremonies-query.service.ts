import { Injectable } from '@nestjs/common';
import type { CeremonyDto } from '@iskcon/contracts';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { CeremoniesRepository } from '../infrastructure/ceremonies.repository';
import { CeremonyLookup } from './ceremony-lookup';
import { CeremonyPresenter } from './ceremony.presenter';
import { EligibilityService } from './eligibility.service';

/** Reads: the list, one ceremony, and who could still be attached. */
@Injectable()
export class CeremoniesQueryService {
  constructor(
    private readonly repo: CeremoniesRepository,
    private readonly lookup: CeremonyLookup,
    private readonly presenter: CeremonyPresenter,
    private readonly eligibility: EligibilityService,
    private readonly ctx: RequestContextService,
  ) {}

  /** Soonest first. */
  async list(): Promise<CeremonyDto[]> {
    return this.presenter.present(await this.repo.list(this.ctx.tenantId));
  }

  async get(id: string): Promise<CeremonyDto> {
    return this.presenter.presentOne(await this.lookup.get(id));
  }

  /** Applications the guru's office accepted that fit this ceremony and are free. Empty once the ceremony is not planned. */
  async eligible(id: string): Promise<Array<{ applicationId: string; candidateName: string }>> {
    const ceremony = await this.lookup.get(id);
    if (ceremony.status !== 'PLANNED') return [];
    return (await this.eligibility.eligible(ceremony)).map((a) => ({ applicationId: a.id, candidateName: a.candidateName }));
  }
}
