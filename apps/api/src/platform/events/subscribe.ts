import { SetMetadata } from '@nestjs/common';

export const SUBSCRIBE_KEY = 'domain-event-subscription';

/**
 * Marks a method as the handler for a domain event type. Handlers must be idempotent: delivery is
 * at least once. A failing handler is retried with back-off, and does not block other subscribers.
 */
export const OnDomainEvent = (type: string): MethodDecorator => SetMetadata(SUBSCRIBE_KEY, type);

export interface DeliveredEvent<P = Record<string, unknown>> {
  id: number;
  type: string;
  tenantId: string;
  payload: P;
  occurredAt: Date;
}
