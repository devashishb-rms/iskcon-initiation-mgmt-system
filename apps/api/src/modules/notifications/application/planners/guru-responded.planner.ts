import { Injectable } from '@nestjs/common';
import { OnDomainEvent, type DeliveredEvent } from '../../../../platform/events/subscribe';
import { EVENTS, type GuruRespondedPayload } from '../../../../shared/events';
import type { DraftNotification } from '../../domain/draft';
import { links } from '../../domain/links';
import { MESSAGE_CODES } from '../../domain/notification-kinds';
import { NotificationPipeline } from '../notification-pipeline.service';
import { RecipientDirectory } from '../recipient-directory.service';
import { EventPlanner } from './event-planner';

/** The guru's office answered: the committee that recorded it, the mentor and the candidate are told. */
@Injectable()
export class GuruRespondedPlanner extends EventPlanner<GuruRespondedPayload> {
  constructor(
    pipeline: NotificationPipeline,
    private readonly directory: RecipientDirectory,
  ) {
    super(pipeline);
  }

  @OnDomainEvent(EVENTS.guruResponded)
  handle(event: DeliveredEvent<GuruRespondedPayload>): Promise<void> {
    return this.run(event);
  }

  async plan(event: DeliveredEvent<GuruRespondedPayload>): Promise<DraftNotification[]> {
    const audience = await this.directory.forApplication(event.payload.applicationId);
    if (!audience) return [];
    const { application, mentor, candidate } = audience;
    const response = event.payload.response;
    const staff = (await this.directory.withRole('COMMITTEE')).concat(mentor ? [mentor] : []);
    const message = { code: MESSAGE_CODES.guruResponseStaff, params: { candidateName: application.candidateName, response } };
    const drafts: DraftNotification[] = staff.map((recipient) => ({
      recipient,
      kind: 'GURU_RESPONSE',
      message,
      link: links.application(application.id),
      scope: application.id,
    }));
    if (candidate) {
      drafts.push({ recipient: candidate, kind: 'GURU_RESPONSE', message: { code: MESSAGE_CODES.guruResponseSelf, params: { response } }, link: links.myPath, scope: application.id });
    }
    return drafts;
  }
}
