import { Injectable } from '@nestjs/common';
import type { RegisterEntryDto } from '@iskcon/contracts';
import { NotFound, RuleViolation } from '../../../common/errors';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { AuditService } from '../../audit';
import { buildCorrection } from '../domain/register-entry';
import { RegisterRepository } from '../infrastructure/register.repository';
import { RegisterPresenter } from './register.presenter';

/**
 * Corrects a spiritual name. The entry is updated in place (it can never be deleted), and the audit
 * line keeps the old value, the new value and the reason, so the register's history is never lost.
 */
@Injectable()
export class RegisterCorrectionService {
  constructor(
    private readonly repo: RegisterRepository,
    private readonly presenter: RegisterPresenter,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
  ) {}

  async correct(id: string, input: { spiritualName: string; reason: string }): Promise<RegisterEntryDto> {
    const tenantId = this.ctx.tenantId;
    const entry = await this.repo.findById(tenantId, id, true);
    if (!entry) throw new NotFound('Register entry');
    const correction = buildCorrection(entry, input.spiritualName, input.reason);
    if (!correction) {
      throw new RuleViolation('VALIDATION_FAILED', 'The spiritual name is already written this way', undefined, [
        { path: 'spiritualName', code: 'UNCHANGED' },
      ]);
    }
    await this.repo.updateSpiritualName(tenantId, id, correction.after.spiritualName);
    await this.audit.record({
      action: 'register.corrected',
      entityType: 'register_entry',
      entityId: id,
      applicationId: entry.applicationId,
      detail: { ...correction },
    });
    const [dto] = await this.presenter.present([{ ...entry, spiritualName: correction.after.spiritualName }]);
    return dto!;
  }
}
