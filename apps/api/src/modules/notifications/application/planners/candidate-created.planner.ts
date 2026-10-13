import { Injectable } from '@nestjs/common';
import { OnDomainEvent, type DeliveredEvent } from '../../../../platform/events/subscribe';
import { EVENTS, type CandidateCreatedPayload } from '../../../../shared/events';
import type { DraftNotification } from '../../domain/draft';
import { links } from '../../domain/links';
import { MESSAGE_CODES } from '../../domain/notification-kinds';
import { NotificationPipeline } from '../notification-pipeline.service';
import { RecipientDirectory } from '../recipient-directory.service';
import { EventPlanner } from './event-planner';

/** A new candidate: welcome them (if they have a login) and tell the assigned mentor. */
@Injectable()
export class CandidateCreatedPlanner extends EventPlanner<CandidateCreatedPayload> {
  constructor(
    pipeline: NotificationPipeline,
    private readonly directory: RecipientDirectory,
  ) {
    super(pipeline);
  }

  @OnDomainEvent(EVENTS.candidateCreated)
  handle(event: DeliveredEvent<CandidateCreatedPayload>): Promise<void> {
    return this.run(event);
  }

  async plan(event: DeliveredEvent<CandidateCreatedPayload>): Promise<DraftNotification[]> {
    const audience = await this.directory.forApplication(event.payload.applicationId);
    if (!audience) return [];
    const { application, mentor, candidate } = audience;
    const drafts: DraftNotification[] = [];
    if (candidate) {
      drafts.push({ recipient: candidate, kind: 'WELCOME', message: { code: MESSAGE_CODES.welcome, params: {} }, link: links.myPath, scope: application.id });
    }
    if (mentor) {
      drafts.push({
        recipient: mentor,
        kind: 'MENTOR_ASSIGNED',
        message: { code: MESSAGE_CODES.mentorAssigned, params: { candidateName: application.candidateName } },
        link: links.application(application.id),
        scope: application.id,
      });
    }
    return drafts;
  }
}
