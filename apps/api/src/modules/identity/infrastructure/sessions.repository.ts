import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { DbService } from '../../../database/database.module';
import { sessions } from '../../../database/schema';

export type SessionRow = typeof sessions.$inferSelect;

@Injectable()
export class SessionsRepository {
  constructor(private readonly db: DbService) {}

  async insert(row: typeof sessions.$inferInsert): Promise<SessionRow> {
    const [created] = await this.db.client.insert(sessions).values(row).returning();
    return created!;
  }

  async findActiveByHash(tokenHash: string, now: Date): Promise<SessionRow | undefined> {
    const [row] = await this.db.client
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .limit(1);
    return row && row.expiresAt > now ? row : undefined;
  }

  async touch(id: string, now: Date): Promise<void> {
    await this.db.client.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id));
  }

  async markMfaVerified(id: string, now: Date): Promise<void> {
    await this.db.client.update(sessions).set({ mfaVerifiedAt: now }).where(eq(sessions.id, id));
  }

  async revoke(id: string, now: Date): Promise<void> {
    await this.db.client.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, id));
  }

  async revokeAllForUser(tenantId: string, userId: string, now: Date): Promise<void> {
    await this.db.client
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.tenantId, tenantId), eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async deleteExpired(before: Date): Promise<number> {
    const res = await this.db.client.delete(sessions).where(lt(sessions.expiresAt, before)).returning({ id: sessions.id });
    return res.length;
  }

  async countActive(tenantId: string): Promise<number> {
    const [r] = await this.db.client
      .select({ n: sql<number>`count(*)` })
      .from(sessions)
      .where(and(eq(sessions.tenantId, tenantId), isNull(sessions.revokedAt)));
    return Number(r?.n ?? 0);
  }
}
