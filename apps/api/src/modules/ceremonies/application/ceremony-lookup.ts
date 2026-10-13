import { Injectable } from '@nestjs/common';
import { Conflict, NotFound } from '../../../common/errors';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import type { Ceremony } from '../domain/ceremony';
import { CeremoniesRepository } from '../infrastructure/ceremonies.repository';

/** Loads a ceremony of this temple or refuses: used by every use case that works on one ceremony. */
@Injectable()
export class CeremonyLookup {
  constructor(
    private readonly repo: CeremoniesRepository,
    private readonly ctx: RequestContextService,
  ) {}

  /** 404 if it does not exist in this temple. `lock` serialises changes to the same ceremony. */
  async get(id: string, lock = false): Promise<Ceremony> {
    const c = await this.repo.find(this.ctx.tenantId, id, lock);
    if (!c) throw new NotFound('Ceremony');
    return c;
  }

  /** Only a PLANNED ceremony can change; anything else is a 409 `CEREMONY_NOT_PLANNED`. */
  async getPlanned(id: string): Promise<Ceremony> {
    const c = await this.get(id, true);
    if (c.status !== 'PLANNED') throw new Conflict('CEREMONY_NOT_PLANNED', 'The ceremony is no longer planned', { status: c.status });
    return c;
  }
}
