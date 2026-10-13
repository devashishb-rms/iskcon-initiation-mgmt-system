import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { DbService } from '../../../database/database.module';
import { otpChallenges } from '../../../database/schema';

export type OtpRow = typeof otpChallenges.$inferSelect;

@Injectable()
export class OtpRepository {
  constructor(private readonly db: DbService) {}

  async insert(row: typeof otpChallenges.$inferInsert): Promise<void> {
    await this.db.client.insert(otpChallenges).values(row);
  }

  async latestOpen(tenantId: string, userId: string): Promise<OtpRow | undefined> {
    const [row] = await this.db.client
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.tenantId, tenantId), eq(otpChallenges.userId, userId), isNull(otpChallenges.consumedAt)))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);
    return row;
  }

  async countSince(tenantId: string, userId: string, since: Date): Promise<number> {
    const [r] = await this.db.client
      .select({ n: sql<number>`count(*)` })
      .from(otpChallenges)
      .where(and(eq(otpChallenges.tenantId, tenantId), eq(otpChallenges.userId, userId), gt(otpChallenges.createdAt, since)));
    return Number(r?.n ?? 0);
  }

  async bumpAttempts(id: string): Promise<number> {
    const [r] = await this.db.client
      .update(otpChallenges)
      .set({ attempts: sql`${otpChallenges.attempts} + 1` })
      .where(eq(otpChallenges.id, id))
      .returning({ attempts: otpChallenges.attempts });
    return r?.attempts ?? 0;
  }

  async consume(id: string, now: Date): Promise<void> {
    await this.db.client.update(otpChallenges).set({ consumedAt: now }).where(eq(otpChallenges.id, id));
  }

  /** Any earlier unused codes stop working when a new one is issued. */
  async consumeAllOpen(tenantId: string, userId: string, now: Date): Promise<void> {
    await this.db.client
      .update(otpChallenges)
      .set({ consumedAt: now })
      .where(and(eq(otpChallenges.tenantId, tenantId), eq(otpChallenges.userId, userId), isNull(otpChallenges.consumedAt)));
  }
}
