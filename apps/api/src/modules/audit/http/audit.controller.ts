import { Controller, Get, Query } from '@nestjs/common';
import { auditQuery, type AuditEntryDto, type Page } from '@iskcon/contracts';
import { RequirePermission } from '../../../platform/access/decorators';
import { zod } from '../../../common/zod.pipe';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { AuditRepository } from '../infrastructure/audit.repository';

@Controller('audit')
export class AuditController {
  constructor(
    private readonly repo: AuditRepository,
    private readonly ctx: RequestContextService,
  ) {}

  @Get()
  @RequirePermission('audit:read')
  async list(@Query(zod(auditQuery)) q: ReturnType<typeof auditQuery.parse>): Promise<Page<AuditEntryDto>> {
    const { rows, total } = await this.repo.list(
      this.ctx.tenantId,
      { applicationId: q.applicationId, action: q.action },
      q.page,
      q.pageSize,
    );
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
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }
}
