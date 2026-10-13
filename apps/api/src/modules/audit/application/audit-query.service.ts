import { Injectable } from '@nestjs/common';
import type { AuditEntryDto, Page } from '@iskcon/contracts';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { AuditRepository } from '../infrastructure/audit.repository';

@Injectable()
export class AuditQueryService {
  constructor(
    private readonly repo: AuditRepository,
    private readonly ctx: RequestContextService,
  ) {}

  async list(
    filter: { applicationId?: string; action?: string },
    page: number,
    pageSize: number,
  ): Promise<Page<AuditEntryDto>> {
    const { rows, total } = await this.repo.list(this.ctx.tenantId, filter, page, pageSize);
    return {
      items: rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        actorName: r.actorName,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        applicationId: r.applicationId,
        ruleSetVersionId: r.ruleSetVersionId,
        detail: r.detail ?? null,
      })),
      page,
      pageSize,
      total,
    };
  }
}
