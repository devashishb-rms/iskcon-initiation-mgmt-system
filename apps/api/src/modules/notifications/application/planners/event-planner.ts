import type { DeliveredEvent } from '../../../../platform/events/subscribe';
import type { DraftNotification } from '../../domain/draft';
import { NotificationPipeline, type NotificationPlanner } from '../notification-pipeline.service';

/**
 * Base of the per-event planners. A concrete planner adds `@OnDomainEvent(<type>)` to a `handle`
 * method that calls `run`, and implements `plan`. A new event type is a new class plus one line in the
 * module's provider list; nothing existing is edited.
 */
export abstract class EventPlanner<P extends Record<string, unknown>> implements NotificationPlanner<P> {
  protected constructor(private readonly pipeline: NotificationPipeline) {}

  abstract plan(event: DeliveredEvent<P>): Promise<DraftNotification[]>;

  protected run(event: DeliveredEvent<P>): Promise<void> {
    return this.pipeline.process(this, event);
  }
}
