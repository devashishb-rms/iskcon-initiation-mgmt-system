import { Injectable } from '@nestjs/common';
import { ApplicationsQueryService } from '../../../candidates';
import { UsersService } from '../../../identity';
import type { NotificationIntent } from '../../domain/draft';
import { reminderDedupeKey } from '../../domain/dedupe';
import { links } from '../../domain/links';
import { MESSAGE_CODES } from '../../domain/notification-kinds';
import { toRecipient } from '../recipient-directory.service';
import { readAllPages } from './paging';
import type { ReminderContext, ReminderRule } from './reminder-rule';
import { ScopedAsUser } from './scoped-as-user';

const WAITING_DAYS = 7;
const DAY_MS = 86_400_000;

/** A daily digest to each president, only on days when some file has waited in APPLIED for more than 7 days. */
@Injectable()
export class FilesWaitingRule implements ReminderRule {
  readonly name = 'files-waiting';

  constructor(
    private readonly users: UsersService,
    private readonly applications: ApplicationsQueryService,
    private readonly asUser: ScopedAsUser,
  ) {}

  async collect({ today, now }: ReminderContext): Promise<NotificationIntent[]> {
    const cutoff = now.getTime() - WAITING_DAYS * DAY_MS;
    const intents: NotificationIntent[] = [];
    const presidents = (await this.users.listByRole('PRESIDENT')).filter((p) => p.active);
    for (const president of presidents) {
      const waiting = await this.asUser.run(president, async () => {
        const applied = await readAllPages((page, pageSize) =>
          this.applications.list({ page, pageSize, status: 'OPEN', stages: ['APPLIED'] }, 'oldest-in-stage'),
        );
        return applied.filter((a) => a.stageSince.getTime() < cutoff);
      });
      if (!waiting.length) continue;
      const oldest = Math.min(...waiting.map((a) => a.stageSince.getTime()));
      intents.push({
        recipient: toRecipient(president),
        kind: 'FILES_WAITING',
        message: { code: MESSAGE_CODES.filesWaiting, params: { count: waiting.length, oldestDays: Math.floor((now.getTime() - oldest) / DAY_MS) } },
        link: links.reviewQueue,
        dedupeKey: reminderDedupeKey(this.name, president.id, today),
      });
    }
    return intents;
  }
}
