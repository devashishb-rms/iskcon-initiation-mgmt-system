import { Inject, Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../../../../database/database.module';
import { Clock } from '../../../../platform/clock/clock';
import { RequestContextService } from '../../../../platform/tenancy/request-context';
import { TenantDirectory, type TenantRecord } from '../../../../platform/tenancy/tenancy.module';
import { jobLockName } from '../../domain/job-lock';
import { AdvisoryLock } from '../../infrastructure/advisory-lock';
import { Notifier } from '../notifier.service';
import { REMINDER_RULES, type ReminderRule } from './reminder-rule';

export interface ReminderRunReport {
  tenantId: string;
  rule: string;
  /** Another instance held the lock for this rule and tenant, so nothing was done here. */
  skipped: boolean;
  /** Notification rows that did not exist before this run. */
  created: number;
  failed: boolean;
}

/**
 * Creates the day's reminders. Each rule runs per tenant, as the system, in its own transaction
 * guarded by a Postgres advisory lock, so two API instances waking at 09:00 never both do the work and
 * one failing rule does not stop the others. The dedupe keys carry the date, so a second run on the
 * same day (a restart, a manual call) creates nothing new.
 */
@Injectable()
export class RemindersJob {
  private readonly log = new Logger(RemindersJob.name);

  constructor(
    private readonly tenants: TenantDirectory,
    @Inject(REMINDER_RULES) private readonly rules: ReminderRule[],
    private readonly notifier: Notifier,
    private readonly lock: AdvisoryLock,
    private readonly uow: UnitOfWork,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
  ) {}

  async runForAllTenants(): Promise<ReminderRunReport[]> {
    const reports: ReminderRunReport[] = [];
    for (const tenant of await this.tenants.all()) reports.push(...(await this.runForTenant(tenant)));
    return reports;
  }

  /** The job's logic as a plain method: the cron expression only decides when it is called. */
  async runForTenant(tenant: Pick<TenantRecord, 'id' | 'timezone'>): Promise<ReminderRunReport[]> {
    const reports: ReminderRunReport[] = [];
    for (const rule of this.rules) reports.push(await this.runRule(rule, tenant));
    return reports;
  }

  private async runRule(rule: ReminderRule, tenant: Pick<TenantRecord, 'id' | 'timezone'>): Promise<ReminderRunReport> {
    const base = { tenantId: tenant.id, rule: rule.name };
    try {
      return await this.ctx.runAsSystem(
        tenant.id,
        () =>
          this.uow.run(async () => {
            if (!(await this.lock.tryAcquire(jobLockName(`reminders:${rule.name}`, tenant.id)))) {
              return { ...base, skipped: true, created: 0, failed: false };
            }
            const intents = await rule.collect({ today: this.clock.today(tenant.timezone), now: this.clock.now() });
            return { ...base, skipped: false, created: await this.notifier.notify(intents), failed: false };
          }),
        `reminders-${rule.name}`,
      );
    } catch (err) {
      this.log.error({ err, ...base }, 'Reminder rule failed');
      return { ...base, skipped: false, created: 0, failed: true };
    }
  }
}
