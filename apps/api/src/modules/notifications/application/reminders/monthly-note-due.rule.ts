import { Injectable } from '@nestjs/common';
import { ApplicationsQueryService } from '../../../candidates';
import { UsersService } from '../../../identity';
import type { NotificationIntent } from '../../domain/draft';
import { reminderDedupeKey } from '../../domain/dedupe';
import { links } from '../../domain/links';
import { MESSAGE_CODES } from '../../domain/notification-kinds';
import { toRecipient } from '../recipient-directory.service';
import { MonthlyNoteLookup } from './monthly-note-lookup';
import { readAllPages } from './paging';
import type { ReminderContext, ReminderRule } from './reminder-rule';
import { ScopedAsUser } from './scoped-as-user';

const NOTE_INTERVAL_DAYS = 35;
const NAMES_SHOWN = 3;
const DAY_MS = 86_400_000;

/**
 * Mentors with open candidates in SHELTER or PREPARING who have written no monthly note for any of
 * them in the last 35 days are reminded once a day. One message per mentor (a count and a few names),
 * not one per candidate.
 */
@Injectable()
export class MonthlyNoteDueRule implements ReminderRule {
  readonly name = 'monthly-note-due';

  constructor(
    private readonly users: UsersService,
    private readonly applications: ApplicationsQueryService,
    private readonly notes: MonthlyNoteLookup,
    private readonly asUser: ScopedAsUser,
  ) {}

  async collect({ today, now }: ReminderContext): Promise<NotificationIntent[]> {
    const cutoff = now.getTime() - NOTE_INTERVAL_DAYS * DAY_MS;
    const intents: NotificationIntent[] = [];
    const mentors = (await this.users.listByRole('MENTOR')).filter((m) => m.active);
    for (const mentor of mentors) {
      const due = await this.asUser.run(mentor, async () => {
        const open = await readAllPages((page, pageSize) =>
          this.applications.list({ page, pageSize, status: 'OPEN', stages: ['SHELTER', 'PREPARING'] }),
        );
        const last = await this.notes.lastMonthlyNoteAt(open.map((a) => a.id));
        return open.filter((a) => (last.get(a.id)?.getTime() ?? 0) < cutoff);
      });
      if (!due.length) continue;
      intents.push({
        recipient: toRecipient(mentor),
        kind: 'MONTHLY_NOTE_DUE',
        message: {
          code: MESSAGE_CODES.monthlyNoteDue,
          params: { count: due.length, names: due.slice(0, NAMES_SHOWN).map((a) => a.candidate.name).join(', ') },
        },
        link: links.candidates,
        dedupeKey: reminderDedupeKey(this.name, mentor.id, today),
      });
    }
    return intents;
  }
}
