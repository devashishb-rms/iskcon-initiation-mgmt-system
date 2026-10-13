import { Injectable } from '@nestjs/common';
import { OnDomainEvent, type DeliveredEvent } from '../../../../platform/events/subscribe';
import { EVENTS, type ApplicationDeclinedPayload } from '../../../../shared/events';
import type { DraftNotification } from '../../domain/draft';
import { links } from '../../domain/links';
import { MESSAGE_CODES } from '../../domain/notification-kinds';
import { NotificationPipeline } from '../notification-pipeline.service';
import { RecipientDirectory } from '../recipient-directory.service';
import { EventPlanner } from './event-planner';

/**
 * A file was declined by the president or by the guru's office. The mentor and the committee get the
 * reason; the candidate is told who decided and is pointed to their mentor, because the way a
 * decline is explained to a person is the mentor's to choose.
 */
@Injectable()
export class ApplicationDeclinedPlanner extends EventPlanner<ApplicationDeclinedPayload> {
  constructor(
    pipeline: NotificationPipeline,
    private readonly directory: RecipientDirectory,
  ) {
    super(pipeline);
  }

  @OnDomainEvent(EVENTS.applicationDeclined)
  handle(event: DeliveredEvent<ApplicationDeclinedPayload>): Promise<void> {
    return this.run(event);
  }

  async plan(event: DeliveredEvent<ApplicationDeclinedPayload>): Promise<DraftNotification[]> {
    const audience = await this.directory.forApplication(event.payload.applicationId);
    if (!audience) return [];
    const { application, mentor, candidate } = audience;
    const by = event.payload.by;
    const staff = (mentor ? [mentor] : []).concat(await this.directory.withRole('COMMITTEE'));
    const message = {
      code: MESSAGE_CODES.declinedStaff,
      params: { candidateName: application.candidateName, by, reason: String(event.payload.reason ?? '') },
    };
    const drafts: DraftNotification[] = staff.map((recipient) => ({
      recipient,
      kind: 'DECLINED',
      message,
      link: links.application(application.id),
      scope: application.id,
    }));
    if (candidate) {
      drafts.push({ recipient: candidate, kind: 'DECLINED', message: { code: MESSAGE_CODES.declinedSelf, params: { by } }, link: links.myPath, scope: application.id });
    }
    return drafts;
  }
}
