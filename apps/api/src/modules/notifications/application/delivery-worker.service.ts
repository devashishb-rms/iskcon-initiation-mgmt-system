import { Inject, Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../../../database/database.module';
import { Clock } from '../../../platform/clock/clock';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { UsersService } from '../../identity';
import { afterFailure, MAX_ATTEMPTS } from '../domain/retry-policy';
import { NotificationsRepository, type NotificationRow } from '../infrastructure/notifications.repository';
import { CHANNEL_SENDERS, ChannelSender } from './channel-senders';
import { MessageRenderer } from './message-renderer.service';

export interface DeliveryReport {
  sent: number;
  retrying: number;
  failed: number;
}

const BATCH = 25;

/**
 * Sends PENDING e-mail and SMS notifications. Rows are claimed with `FOR UPDATE SKIP LOCKED`, so
 * several API instances can run it side by side. A failing send is retried with exponential back-off
 * and given up on after MAX_ATTEMPTS; it never touches the transaction that created the notification.
 */
@Injectable()
export class DeliveryWorker {
  private readonly log = new Logger(DeliveryWorker.name);
  private running = false;
  private readonly senders: Map<string, ChannelSender>;

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly users: UsersService,
    private readonly renderer: MessageRenderer,
    private readonly uow: UnitOfWork,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
    @Inject(CHANNEL_SENDERS) senders: ChannelSender[],
  ) {
    this.senders = new Map(senders.map((s) => [s.channel, s]));
  }

  /** Handles one batch of due rows. The scheduler calls this on a timer; tests call it directly. */
  async deliverPending(limit = BATCH): Promise<DeliveryReport> {
    const report: DeliveryReport = { sent: 0, retrying: 0, failed: 0 };
    if (this.running) return report;
    this.running = true;
    try {
      await this.uow.run(async () => {
        const rows = await this.repo.claimDue(limit, this.clock.now());
        for (const row of rows) {
          const outcome = await this.ctx.runAsSystem(row.tenantId, () => this.deliverOne(row), `notification-${row.id}`);
          report[outcome] += 1;
        }
      });
    } finally {
      this.running = false;
    }
    if (report.sent || report.retrying || report.failed) {
      this.log.log(`Delivery: ${report.sent} sent, ${report.retrying} to retry, ${report.failed} failed`);
    }
    return report;
  }

  private async deliverOne(row: NotificationRow): Promise<'sent' | 'retrying' | 'failed'> {
    const attempts = row.attempts + 1;
    const sender = this.senders.get(row.channel);
    // Nothing a retry can fix: the channel is off, or the person is gone, inactive or has no address.
    if (!sender || !sender.available) return this.giveUp(row, attempts, 'CHANNEL_UNAVAILABLE');
    const user = await this.users.find(row.userId);
    if (!user || !user.active) return this.giveUp(row, attempts, 'RECIPIENT_UNAVAILABLE');
    const address = sender.addressOf(user);
    if (!address) return this.giveUp(row, attempts, 'NO_ADDRESS');

    try {
      await sender.send(address, this.renderer.render(user.locale, row.payload));
    } catch (err) {
      return this.recordFailure(row, attempts, err);
    }
    await this.repo.markSent(row.id, attempts, this.clock.now());
    return 'sent';
  }

  private async giveUp(row: NotificationRow, attempts: number, reason: string): Promise<'failed'> {
    await this.repo.markFailed(row.id, attempts, reason);
    return 'failed';
  }

  private async recordFailure(row: NotificationRow, attempts: number, err: unknown): Promise<'retrying' | 'failed'> {
    const error = String((err as Error)?.message ?? err).slice(0, 300);
    // Ids and counts only: the message text and the address are personal.
    this.log.warn(`Send failed: notification ${row.id} on ${row.channel}, attempt ${attempts} of ${MAX_ATTEMPTS}`);
    const next = afterFailure(attempts, this.clock.now());
    if (next.give === 'FAILED') {
      await this.repo.markFailed(row.id, attempts, error);
      return 'failed';
    }
    await this.repo.scheduleRetry(row.id, attempts, error, next.at);
    return 'retrying';
  }
}
