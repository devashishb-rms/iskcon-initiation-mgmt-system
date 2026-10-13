import { Injectable } from '@nestjs/common';
import type { Page, RegisterEntryDto } from '@iskcon/contracts';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import type { RegisterFilter } from '../domain/register-entry';
import { RegisterRepository } from '../infrastructure/register.repository';
import { RegisterPresenter } from './register.presenter';

/** The most rows one export will contain. A temple's register grows by a few dozen a year. */
export const EXPORT_LIMIT = 20_000;

/** Reads the register: the searchable list and the unpaged rows for exports. */
@Injectable()
export class RegisterQueryService {
  constructor(
    private readonly repo: RegisterRepository,
    private readonly presenter: RegisterPresenter,
    private readonly ctx: RequestContextService,
  ) {}

  async list(filter: RegisterFilter, page: number, pageSize: number): Promise<Page<RegisterEntryDto>> {
    const { rows, total } = await this.repo.search(this.ctx.tenantId, filter, page, pageSize);
    return { items: await this.presenter.present(rows), page, pageSize, total };
  }

  async all(filter: RegisterFilter): Promise<RegisterEntryDto[]> {
    return this.presenter.present(await this.repo.searchAll(this.ctx.tenantId, filter, EXPORT_LIMIT));
  }
}
