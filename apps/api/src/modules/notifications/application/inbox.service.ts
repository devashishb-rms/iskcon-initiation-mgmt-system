import { Injectable } from '@nestjs/common';
import type { NotificationDto, Page } from '@iskcon/contracts';
import { NotFound } from '../../../common/errors';
import { Clock } from '../../../platform/clock/clock';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { NotificationsRepository, type NotificationRow } from '../infrastructure/notifications.repository';

export interface Inbox extends Page<NotificationDto> {
  unread: number;
}

const toDto = (row: NotificationRow): NotificationDto => ({
  id: row.id,
  kind: row.kind,
  message: { code: row.payload.message.code, params: row.payload.message.params },
  link: row.payload.link,
  createdAt: row.createdAt.toISOString(),
  readAt: row.readAt ? row.readAt.toISOString() : null,
});

/** What a signed-in person does with their own in-app notifications. Never anyone else's. */
@Injectable()
export class InboxService {
  constructor(
    private readonly repo: NotificationsRepository,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
  ) {}

  async list(page: number, pageSize: number): Promise<Inbox> {
    const { tenantId } = this.ctx.current();
    const userId = this.ctx.user().id;
    const { rows, total } = await this.repo.listInApp(tenantId, userId, page, pageSize);
    return { items: rows.map(toDto), page, pageSize, total, unread: await this.repo.countUnread(tenantId, userId) };
  }

  /** 404 for an id that is not the caller's own in-app notification, so other people's ids are not confirmed. */
  async markRead(id: string): Promise<void> {
    const { tenantId } = this.ctx.current();
    const userId = this.ctx.user().id;
    if (!(await this.repo.ownsInApp(tenantId, userId, id))) throw new NotFound('Notification');
    await this.repo.markRead(tenantId, userId, id, this.clock.now());
  }

  async markAllRead(): Promise<void> {
    await this.repo.markAllRead(this.ctx.tenantId, this.ctx.user().id, this.clock.now());
  }
}
