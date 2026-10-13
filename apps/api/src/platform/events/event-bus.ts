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
    await this.db.client.insert(outboxEvents).values({
      tenantId: this.ctx.tenantId,
      type,
      payload,
    });
  }
}
