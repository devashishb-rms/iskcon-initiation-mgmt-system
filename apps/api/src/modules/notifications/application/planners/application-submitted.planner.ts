import { Injectable } from '@nestjs/common';
import { OnDomainEvent, type DeliveredEvent } from '../../../../platform/events/subscribe';
import { ApplicationAccess } from '../../../../shared/application-ports';
import { EVENTS, type ApplicationSubmittedPayload } from '../../../../shared/events';
import type { DraftNotification } from '../../domain/draft';
import { links } from '../../domain/links';
import { MESSAGE_CODES } from '../../domain/notification-kinds';
import { NotificationPipeline } from '../notification-pipeline.service';
import { RecipientDirectory } from '../recipient-directory.service';
import { EventPlanner } from './event-planner';

/** A mentor submitted a file: every president is told one is waiting. */
@Injectable()
export class ApplicationSubmittedPlanner extends EventPlanner<ApplicationSubmittedPayload> {
  constructor(
    pipeline: NotificationPipeline,
    private readonly directory: RecipientDirectory,
    private readonly applications: ApplicationAccess,
  ) {
    super(pipeline);
  }

  @OnDomainEvent(EVENTS.applicationSubmitted)
  handle(event: DeliveredEvent<ApplicationSubmittedPayload>): Promise<void> {
    return this.run(event);
  }

  async plan(event: DeliveredEvent<ApplicationSubmittedPayload>): Promise<DraftNotification[]> {
    const application = await this.applications.find(event.payload.applicationId);
    if (!application) return [];
    return (await this.directory.withRole('PRESIDENT')).map((recipient) => ({
      recipient,
      kind: 'APPLICATION_SUBMITTED',
      message: { code: MESSAGE_CODES.fileWaiting, params: { candidateName: application.candidateName } },
      link: links.reviewQueue,
      scope: application.id,
    }));
  }
}
