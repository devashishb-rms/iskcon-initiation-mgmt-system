import { Injectable } from '@nestjs/common';
import type { DeliveredEvent } from '../../../platform/events/subscribe';
import type { DraftNotification, NotificationIntent } from '../domain/draft';
import { actorOf, eventDedupeKey, uniqueByRecipient } from '../domain/dedupe';
import { Notifier } from './notifier.service';

/** A planner decides who is told what about one kind of event. It does not decide anything else. */
export interface NotificationPlanner<P extends Record<string, unknown>> {
  plan(event: DeliveredEvent<P>): Promise<DraftNotification[]>;
}

/**
 * The steps every event-driven notification goes through after its planner has spoken: one message
 * per person, never to the person who caused the event, a dedupe key from the event, then the Notifier.
 */
@Injectable()
export class NotificationPipeline {
  constructor(private readonly notifier: Notifier) {}

  async process<P extends Record<string, unknown>>(planner: NotificationPlanner<P>, event: DeliveredEvent<P>): Promise<void> {
    const actorId = actorOf(event.payload);
    const drafts = uniqueByRecipient(await planner.plan(event)).filter((d) => d.recipient.id !== actorId);
    const intents: NotificationIntent[] = drafts.map((d) => ({ ...d, dedupeKey: eventDedupeKey(event, d) }));
    await this.notifier.notify(intents);
  }
}
