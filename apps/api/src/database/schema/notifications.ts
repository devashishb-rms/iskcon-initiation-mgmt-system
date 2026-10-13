import { index, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, createdAtCol, tstz } from './_helpers';
import { channelEnum, notificationStatusEnum } from './enums';
import { users } from './identity';

export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    tenantId: tenantCol(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    kind: text().notNull(),
    channel: channelEnum().notNull(),
    payload: jsonb().notNull(),
    /** Stops the same reminder being created twice (one per document per week, say). */
    dedupeKey: text().notNull(),
    status: notificationStatusEnum().notNull().default('PENDING'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    createdAt: createdAtCol(),
    sentAt: tstz(),
    readAt: tstz(),
  },
  (t) => [
    unique('notifications_dedupe_uq').on(t.tenantId, t.dedupeKey, t.channel),
    index('notifications_user_idx').on(t.tenantId, t.userId, t.createdAt),
    index('notifications_pending_idx').on(t.status, t.channel),
  ],
);
