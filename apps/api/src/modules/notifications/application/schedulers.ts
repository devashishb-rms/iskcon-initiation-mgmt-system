import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { DeliveryWorker } from './delivery-worker.service';
import { RemindersJob } from './reminders/reminders.job';

/** Reminders go out at nine in the morning, temple time. */
export const REMINDERS_CRON = '0 9 * * *';
export const REMINDERS_TIME_ZONE = 'Asia/Kolkata';
const DELIVERY_POLL_MS = 5_000;

/**
 * The only classes that know about timers. They do nothing but call the plain methods, so the work
 * itself is tested without waiting for a clock. SCHEDULER_ENABLED=false switches them off (tests,
 * or an instance that should not run jobs).
 */
@Injectable()
export class NotificationSchedulers {
  private readonly log = new Logger(NotificationSchedulers.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reminders: RemindersJob,
    private readonly delivery: DeliveryWorker,
  ) {}

  @Cron(REMINDERS_CRON, { name: 'notifications.reminders', timeZone: REMINDERS_TIME_ZONE })
  async dailyReminders(): Promise<void> {
    if (!this.env.SCHEDULER_ENABLED) return;
    try {
      const reports = await this.reminders.runForAllTenants();
      this.log.log(`Reminders: ${reports.reduce((n, r) => n + r.created, 0)} notification row(s) created`);
    } catch (err) {
      this.log.error({ err }, 'Daily reminders failed');
    }
  }

  @Interval('notifications.delivery', DELIVERY_POLL_MS)
  async deliverPending(): Promise<void> {
    if (!this.env.SCHEDULER_ENABLED) return;
    try {
      await this.delivery.deliverPending();
    } catch (err) {
      this.log.error({ err }, 'Notification delivery failed');
    }
  }
}
