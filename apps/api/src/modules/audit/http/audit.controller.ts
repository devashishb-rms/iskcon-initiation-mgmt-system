import { Controller, Get, Query } from '@nestjs/common';
import { auditQuery, type AuditEntryDto, type Page } from '@iskcon/contracts';
import { RequirePermission } from '../../../platform/access/decorators';
import { zod } from '../../../common/zod.pipe';
import { AuditQueryService } from '../application/audit-query.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @RequirePermission('audit:read')
  list(@Query(zod(auditQuery)) q: ReturnType<typeof auditQuery.parse>): Promise<Page<AuditEntryDto>> {
    return this.audit.list({ applicationId: q.applicationId, action: q.action }, q.page, q.pageSize);
  }
}
