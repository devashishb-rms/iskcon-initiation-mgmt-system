import { Injectable } from '@nestjs/common';
import { DbService } from '../../database/database.module';
import { outboxEvents } from '../../database/schema';
import { RequestContextService } from '../tenancy/request-context';

/**
 * Publishes a domain event by writing it to the outbox in the caller's transaction. If the
 * transaction rolls back, the event never existed. Delivery is the dispatcher's job.
 */
@Injectable()
export class EventBus {
  constructor(
    private readonly db: DbService,
    private readonly ctx: RequestContextService,
  ) {}

  async publish<P extends Record<string, unknown>>(type: string, payload: P): Promise<void> {
    // The person who caused the event travels with it, so subscribers can leave them out of
    // "someone did X" messages about their own action. A payload may set `actorId` itself.
    const actorId = this.ctx.peek()?.user?.id;
    await this.db.client.insert(outboxEvents).values({
      tenantId: this.ctx.tenantId,
      type,
      payload: actorId && payload.actorId === undefined ? { ...payload, actorId } : payload,
    });
  }
}
