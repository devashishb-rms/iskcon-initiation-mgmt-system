import { Injectable } from '@nestjs/common';
import { OnDomainEvent, type DeliveredEvent } from '../../../../platform/events/subscribe';
import { EVENTS, type CeremonyCompletedPayload } from '../../../../shared/events';
import type { DraftNotification } from '../../domain/draft';
import { links } from '../../domain/links';
import { MESSAGE_CODES } from '../../domain/notification-kinds';
import { NotificationPipeline } from '../notification-pipeline.service';
import { RecipientDirectory } from '../recipient-directory.service';
import { EventPlanner } from './event-planner';

/** A ceremony was completed: each initiated candidate with a login, and their mentor, are told. */
@Injectable()
export class CeremonyCompletedPlanner extends EventPlanner<CeremonyCompletedPayload> {
  constructor(
    pipeline: NotificationPipeline,
    private readonly directory: RecipientDirectory,
  ) {
    super(pipeline);
  }

  @OnDomainEvent(EVENTS.ceremonyCompleted)
  handle(event: DeliveredEvent<CeremonyCompletedPayload>): Promise<void> {
    return this.run(event);
  }

  async plan(event: DeliveredEvent<CeremonyCompletedPayload>): Promise<DraftNotification[]> {
    const { applicationIds, date } = event.payload;
    const drafts: DraftNotification[] = [];
    for (const applicationId of applicationIds) {
      const audience = await this.directory.forApplication(applicationId);
      if (!audience) continue;
      const { application, mentor, candidate } = audience;
      if (candidate) {
        drafts.push({ recipient: candidate, kind: 'CEREMONY_COMPLETED', message: { code: MESSAGE_CODES.ceremonyCompletedSelf, params: { date } }, link: links.myPath, scope: application.id });
      }
      if (mentor) {
        drafts.push({
          recipient: mentor,
          kind: 'CEREMONY_COMPLETED',
          message: { code: MESSAGE_CODES.ceremonyCompletedStaff, params: { candidateName: application.candidateName, date } },
          link: links.application(application.id),
          scope: application.id,
        });
      }
    }
    return drafts;
  }
}
