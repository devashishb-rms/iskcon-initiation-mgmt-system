import { Injectable } from '@nestjs/common';
import { OnDomainEvent, type DeliveredEvent } from '../../../../platform/events/subscribe';
import { EVENTS, type DocumentUploadedPayload } from '../../../../shared/events';
import type { DraftNotification } from '../../domain/draft';
import { links } from '../../domain/links';
import { MESSAGE_CODES } from '../../domain/notification-kinds';
import { NotificationPipeline } from '../notification-pipeline.service';
import { RecipientDirectory } from '../recipient-directory.service';
import { EventPlanner } from './event-planner';

/**
 * A document was added to a file: the assigned mentor is told. When the mentor is the uploader the
 * pipeline drops them (nobody is told about their own action). Only the document type travels, never
 * its name or contents.
 */
@Injectable()
export class DocumentUploadedPlanner extends EventPlanner<DocumentUploadedPayload> {
  constructor(
    pipeline: NotificationPipeline,
    private readonly directory: RecipientDirectory,
  ) {
    super(pipeline);
  }

  @OnDomainEvent(EVENTS.documentUploaded)
  handle(event: DeliveredEvent<DocumentUploadedPayload>): Promise<void> {
    return this.run(event);
  }

  async plan(event: DeliveredEvent<DocumentUploadedPayload>): Promise<DraftNotification[]> {
    const audience = await this.directory.forApplication(event.payload.applicationId);
    if (!audience?.mentor) return [];
    const { application, mentor } = audience;
    return [
      {
        recipient: mentor,
        kind: 'DOCUMENT_UPLOADED',
        message: { code: MESSAGE_CODES.documentUploaded, params: { candidateName: application.candidateName, documentType: String(event.payload.type) } },
        link: links.application(application.id),
        scope: event.payload.documentId,
      },
    ];
  }
}
