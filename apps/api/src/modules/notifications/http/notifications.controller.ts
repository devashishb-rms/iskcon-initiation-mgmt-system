import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { pageQuery, type NotificationDto, type Page, type PageQuery } from '@iskcon/contracts';
import { RequirePermission } from '../../../platform/access/decorators';
import { zod } from '../../../common/zod.pipe';
import { UnitOfWork } from '../../../database/database.module';
import { InboxService } from '../application/inbox.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly inbox: InboxService,
    private readonly uow: UnitOfWork,
  ) {}

  /** The caller's own in-app notifications, newest first; the unread total travels in a header. */
  @Get()
  @RequirePermission('notification:read')
  async list(@Query(zod(pageQuery)) query: PageQuery, @Res({ passthrough: true }) res: Response): Promise<Page<NotificationDto>> {
    const { unread, ...page } = await this.uow.run(() => this.inbox.list(query.page, query.pageSize));
    res.setHeader('X-Unread-Count', String(unread));
    return page;
  }

  @Post('read-all')
  @HttpCode(204)
  @RequirePermission('notification:read')
  async readAll(): Promise<void> {
    await this.uow.run(() => this.inbox.markAllRead());
  }

  @Post(':id/read')
  @HttpCode(204)
  @RequirePermission('notification:read')
  async read(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.uow.run(() => this.inbox.markRead(id));
  }
}
