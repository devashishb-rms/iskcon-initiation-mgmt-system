import { Injectable } from '@nestjs/common';
import { OnDomainEvent, type DeliveredEvent } from '../../../../platform/events/subscribe';
import { EVENTS, type ApplicationApprovedPayload } from '../../../../shared/events';
import type { DraftNotification } from '../../domain/draft';
import { links } from '../../domain/links';
import { MESSAGE_CODES } from '../../domain/notification-kinds';
import { NotificationPipeline } from '../notification-pipeline.service';
import { RecipientDirectory } from '../recipient-directory.service';
import { EventPlanner } from './event-planner';

/** The president approved a file: the committee prepares the letter, the mentor and the candidate rejoice. */
@Injectable()
export class ApplicationApprovedPlanner extends EventPlanner<ApplicationApprovedPayload> {
  constructor(
    pipeline: NotificationPipeline,
    private readonly directory: RecipientDirectory,
  ) {
    super(pipeline);
  }

  @OnDomainEvent(EVENTS.applicationApproved)
  handle(event: DeliveredEvent<ApplicationApprovedPayload>): Promise<void> {
    return this.run(event);
  }

  async plan(event: DeliveredEvent<ApplicationApprovedPayload>): Promise<DraftNotification[]> {
    const audience = await this.directory.forApplication(event.payload.applicationId);
    if (!audience) return [];
    const { application, mentor, candidate } = audience;
    const staff = (await this.directory.withRole('COMMITTEE')).concat(mentor ? [mentor] : []);
    const message = { code: MESSAGE_CODES.approvedStaff, params: { candidateName: application.candidateName } };
    const drafts: DraftNotification[] = staff.map((recipient) => ({
      recipient,
      kind: 'APPROVED',
      message,
      link: links.application(application.id),
      scope: application.id,
    }));
    if (candidate) {
      drafts.push({ recipient: candidate, kind: 'APPROVED', message: { code: MESSAGE_CODES.approvedSelf, params: {} }, link: links.myPath, scope: application.id });
    }
    return drafts;
  }
}
