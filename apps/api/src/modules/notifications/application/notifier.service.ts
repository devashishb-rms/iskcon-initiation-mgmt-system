import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../../platform/clock/clock';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { SmsGateway } from '../../../platform/delivery/gateways';
import { selectChannels } from '../domain/channel-policy';
import type { NotificationIntent } from '../domain/draft';
import { NotificationsRepository, type NewNotification } from '../infrastructure/notifications.repository';

/**
 * Turns intents into `notifications` rows: one per person per channel the kind's policy allows and
 * the person can be reached on. Writing is idempotent (unique tenant + dedupe key + channel), so a
 * redelivered event or a re-run job adds nothing. Sending is the DeliveryWorker's job, not this one's.
 */
@Injectable()
export class Notifier {
  private readonly log = new Logger(Notifier.name);

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly sms: SmsGateway,
    private readonly clock: Clock,
    private readonly ctx: RequestContextService,
  ) {}

  /** Returns the number of rows that did not exist before. */
  async notify(intents: NotificationIntent[]): Promise<number> {
    const tenantId = this.ctx.tenantId;
    const now = this.clock.now();
    const smsEnabled = this.sms.enabled;
    const rows: NewNotification[] = intents.flatMap((intent) =>
      selectChannels(intent.kind, intent.recipient, smsEnabled).map((channel) => ({
        tenantId,
        userId: intent.recipient.id,
        kind: intent.kind,
        channel,
        payload: { message: intent.message, link: intent.link },
        dedupeKey: intent.dedupeKey,
        // The inbox is the delivery of an in-app notification; the others wait for the worker.
        status: channel === 'IN_APP' ? ('SENT' as const) : ('PENDING' as const),
        sentAt: channel === 'IN_APP' ? now : null,
        createdAt: now,
      })),
    );
    const created = await this.repo.insertNew(rows);
    // Counts only: message parameters can carry a person's name or a reason.
    this.log.debug(`${intents.length} intent(s), ${created} new row(s)`);
    return created;
  }
}
