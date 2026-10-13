import { Injectable } from '@nestjs/common';
import { OnDomainEvent, type DeliveredEvent } from '../../../../platform/events/subscribe';
import { EVENTS, type ApplicationSentBackPayload } from '../../../../shared/events';
import type { DraftNotification } from '../../domain/draft';
import { links } from '../../domain/links';
import { MESSAGE_CODES } from '../../domain/notification-kinds';
import { NotificationPipeline } from '../notification-pipeline.service';
import { RecipientDirectory } from '../recipient-directory.service';
import { EventPlanner } from './event-planner';

/**
 * The president sent a file back: the mentor and the candidate learn why. Both may read the reason
 * in the file (the candidate sees SEND_BACK notes), so it is included in both messages.
 */
@Injectable()
export class ApplicationSentBackPlanner extends EventPlanner<ApplicationSentBackPayload> {
  constructor(
    pipeline: NotificationPipeline,
    private readonly directory: RecipientDirectory,
  ) {
    super(pipeline);
  }

  @OnDomainEvent(EVENTS.applicationSentBack)
  handle(event: DeliveredEvent<ApplicationSentBackPayload>): Promise<void> {
    return this.run(event);
  }

  async plan(event: DeliveredEvent<ApplicationSentBackPayload>): Promise<DraftNotification[]> {
    const audience = await this.directory.forApplication(event.payload.applicationId);
    if (!audience) return [];
    const { application, mentor, candidate } = audience;
    const reason = String(event.payload.reason ?? '');
    const drafts: DraftNotification[] = [];
    if (mentor) {
      drafts.push({
        recipient: mentor,
        kind: 'SENT_BACK',
        message: { code: MESSAGE_CODES.sentBackStaff, params: { candidateName: application.candidateName, reason } },
        link: links.application(application.id),
        scope: application.id,
      });
    }
    if (candidate) {
      drafts.push({ recipient: candidate, kind: 'SENT_BACK', message: { code: MESSAGE_CODES.sentBackSelf, params: { reason } }, link: links.myPath, scope: application.id });
    }
    return drafts;
  }
}
