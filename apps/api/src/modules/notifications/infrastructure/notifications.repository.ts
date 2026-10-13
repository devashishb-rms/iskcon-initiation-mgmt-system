import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { DbService } from '../../../database/database.module';
import { notifications } from '../../../database/schema';
import type { Channel, MessageCode, MessageParams, NotificationKind } from '../domain/notification-kinds';

/**
 * What is kept in `notifications.payload`. `message` and `link` are what the web app renders;
 * `retry` is delivery bookkeeping for EMAIL and SMS rows (the table has no column for the next try).
 */
export interface StoredPayload {
  message: { code: MessageCode; params: MessageParams };
  link: string | null;
  retry?: { at: string };
}

export interface NewNotification {
  tenantId: string;
  userId: string;
  kind: NotificationKind;
  channel: Channel;
  payload: StoredPayload;
  dedupeKey: string;
  status: 'PENDING' | 'SENT';
  sentAt: Date | null;
  createdAt: Date;
}

export interface NotificationRow {
  id: string;
  tenantId: string;
  userId: string;
  kind: string;
  channel: Channel;
  payload: StoredPayload;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'READ';
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
  readAt: Date | null;
}

/** The only place that touches the `notifications` table. */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly db: DbService) {}

  /** Inserts rows that do not exist yet (same tenant, dedupe key and channel) and returns how many were new. */
  async insertNew(rows: NewNotification[]): Promise<number> {
    if (!rows.length) return 0;
    const inserted = await this.db.client
      .insert(notifications)
      .values(rows)
      .onConflictDoNothing({ target: [notifications.tenantId, notifications.dedupeKey, notifications.channel] })
      .returning({ id: notifications.id });
    return inserted.length;
  }

  // ───────── the inbox (IN_APP rows of one person) ─────────

  async listInApp(tenantId: string, userId: string, page: number, pageSize: number): Promise<{ rows: NotificationRow[]; total: number }> {
    const where = and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId), eq(notifications.channel, 'IN_APP'));
    const rows = await this.db.client
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [totalRow] = await this.db.client.select({ n: count() }).from(notifications).where(where);
    return { rows: rows as NotificationRow[], total: Number(totalRow?.n ?? 0) };
  }

  async countUnread(tenantId: string, userId: string): Promise<number> {
    const [row] = await this.db.client
      .select({ n: count() })
      .from(notifications)
      .where(
        and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId), eq(notifications.channel, 'IN_APP'), isNull(notifications.readAt)),
      );
    return Number(row?.n ?? 0);
  }

  /** True when the person has an in-app notification with this id (read or not). */
  async ownsInApp(tenantId: string, userId: string, id: string): Promise<boolean> {
    const [row] = await this.db.client
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId), eq(notifications.channel, 'IN_APP'), eq(notifications.id, id)))
      .limit(1);
    return Boolean(row);
  }

  /** Marks one unread notification read. A notification that is already read keeps its first read time. */
  async markRead(tenantId: string, userId: string, id: string, at: Date): Promise<void> {
    await this.db.client
      .update(notifications)
      .set({ readAt: at, status: 'READ' })
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.userId, userId),
          eq(notifications.channel, 'IN_APP'),
          eq(notifications.id, id),
          isNull(notifications.readAt),
        ),
      );
  }

  async markAllRead(tenantId: string, userId: string, at: Date): Promise<number> {
    const updated = await this.db.client
      .update(notifications)
      .set({ readAt: at, status: 'READ' })
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId), eq(notifications.channel, 'IN_APP'), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return updated.length;
  }

  // ───────── delivery (EMAIL and SMS rows, across tenants) ─────────

  /**
   * Locks a batch of rows that are due. `SKIP LOCKED` lets several API instances work side by side
   * without sending anything twice. Spans tenants on purpose: the worker serves the whole deployment
   * and enters each row's tenant before touching anything else.
   */
  async claimDue(limit: number, now: Date): Promise<NotificationRow[]> {
    const raw = await this.db.client.execute(sql`
      SELECT id, tenant_id AS "tenantId", user_id AS "userId", kind, channel, payload, status, attempts,
             last_error AS "lastError", created_at AS "createdAt", sent_at AS "sentAt", read_at AS "readAt"
      FROM notifications
      WHERE status = 'PENDING'
        AND channel IN ('EMAIL', 'SMS')
        AND (payload #>> '{retry,at}' IS NULL OR (payload #>> '{retry,at}')::timestamptz <= ${now.toISOString()}::timestamptz)
      ORDER BY created_at, id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`);
    return raw.rows as unknown as NotificationRow[];
  }

  async markSent(id: string, attempts: number, at: Date): Promise<void> {
    await this.db.client
      .update(notifications)
      .set({ status: 'SENT', attempts, sentAt: at, lastError: null, payload: sql`payload - 'retry'` })
      .where(eq(notifications.id, id));
  }

  async scheduleRetry(id: string, attempts: number, error: string, retryAt: Date): Promise<void> {
    await this.db.client
      .update(notifications)
      .set({
        attempts,
        lastError: error,
        payload: sql`jsonb_set(payload, '{retry}', ${JSON.stringify({ at: retryAt.toISOString() })}::jsonb)`,
      })
      .where(eq(notifications.id, id));
  }

  async markFailed(id: string, attempts: number, error: string): Promise<void> {
    await this.db.client
      .update(notifications)
      .set({ status: 'FAILED', attempts, lastError: error, payload: sql`payload - 'retry'` })
      .where(eq(notifications.id, id));
  }
}
