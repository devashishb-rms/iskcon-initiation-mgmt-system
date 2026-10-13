import { Injectable } from '@nestjs/common';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { AuditRepository } from '../infrastructure/audit.repository';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  applicationId?: string;
  ruleSetVersionId?: string;
  detail?: Record<string, unknown>;
}

/**
 * Writes the append-only audit log (NFR-6). Called inside the same transaction as the change it
 * describes, so a change and its audit line commit or roll back together.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly repo: AuditRepository,
    private readonly ctx: RequestContextService,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const c = this.ctx.current();
    await this.repo.insert({
      tenantId: c.tenantId,
      actorId: c.user?.id ?? null,
      actorName: c.user?.name ?? (c.system ? 'System' : 'Anonymous'),
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      applicationId: entry.applicationId ?? null,
      ruleSetVersionId: entry.ruleSetVersionId ?? null,
      detail: entry.detail ?? null,
      requestId: c.requestId,
    });
  }
}
