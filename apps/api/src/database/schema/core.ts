import {
  bigserial,
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { outboxStatusEnum } from './enums';

/** Platform tables: the tenant registry and the transactional outbox. */
export const tenants = pgTable('tenants', {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  timezone: text().notNull().default('Asia/Kolkata'),
  defaultLocale: text().notNull().default('en'),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Domain events are written here in the same transaction as the change that caused them, then
 * delivered at least once to subscribers (ADR-0004).
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    type: text().notNull(),
    payload: jsonb().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    availableAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    status: outboxStatusEnum().notNull().default('PENDING'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('outbox_pending_idx').on(t.status, t.availableAt)],
);

/** One row per (event, subscriber) that finished. Makes at-least-once delivery idempotent. */
export const processedEvents = pgTable(
  'processed_events',
  {
    eventId: bigint({ mode: 'number' }).notNull(),
    subscriber: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.subscriber] })],
);
