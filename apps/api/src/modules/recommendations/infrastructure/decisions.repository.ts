import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Decision, GuruResponseType } from '@iskcon/contracts';
import { DbService } from '../../../database/database.module';
import { guruResponses, recommendations } from '../../../database/schema';

export interface RecommendationRecord {
  id: string;
  applicationId: string;
  decision: Decision;
  reason: string | null;
  decidedById: string;
  ruleSetVersionId: string;
  evaluationSnapshot: unknown;
  createdAt: Date;
}

export interface GuruResponseRecord {
  id: string;
  applicationId: string;
  response: GuruResponseType;
  reason: string | null;
  recordedById: string;
  recordedAt: Date;
}

/** The president's decisions and the guru's office's answers. Both tables are append-only (database triggers). */
@Injectable()
export class DecisionsRepository {
  constructor(private readonly db: DbService) {}

  // ───────── recommendations ─────────

  async insertRecommendation(row: {
    tenantId: string;
    applicationId: string;
    decision: Decision;
    reason: string | null;
    decidedById: string;
    ruleSetVersionId: string;
    evaluationSnapshot: unknown;
  }): Promise<RecommendationRecord> {
    const [r] = await this.db.client.insert(recommendations).values(row).returning();
    return toRecommendation(r!);
  }

  /** Newest first. */
  async recommendationsOf(tenantId: string, applicationId: string): Promise<RecommendationRecord[]> {
    const rows = await this.db.client
      .select()
      .from(recommendations)
      .where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.applicationId, applicationId)))
      .orderBy(desc(recommendations.createdAt), desc(recommendations.id));
    return rows.map(toRecommendation);
  }

  async latestRecommendation(tenantId: string, applicationId: string): Promise<RecommendationRecord | undefined> {
    const [r] = await this.db.client
      .select()
      .from(recommendations)
      .where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.applicationId, applicationId)))
      .orderBy(desc(recommendations.createdAt), desc(recommendations.id))
      .limit(1);
    return r && toRecommendation(r);
  }

  // ───────── guru responses ─────────

  async insertGuruResponse(row: {
    tenantId: string;
    applicationId: string;
    response: GuruResponseType;
    reason: string | null;
    recordedById: string;
  }): Promise<GuruResponseRecord> {
    const [r] = await this.db.client.insert(guruResponses).values(row).returning();
    return toGuruResponse(r!);
  }

  /** Oldest first. */
  async guruResponsesOf(tenantId: string, applicationIds: string[]): Promise<GuruResponseRecord[]> {
    if (!applicationIds.length) return [];
    const rows = await this.db.client
      .select()
      .from(guruResponses)
      .where(and(eq(guruResponses.tenantId, tenantId), inArray(guruResponses.applicationId, applicationIds)))
      .orderBy(asc(guruResponses.recordedAt), asc(guruResponses.id));
    return rows.map(toGuruResponse);
  }
}

const toRecommendation = (r: typeof recommendations.$inferSelect): RecommendationRecord => ({
  id: r.id,
  applicationId: r.applicationId,
  decision: r.decision,
  reason: r.reason,
  decidedById: r.decidedById,
  ruleSetVersionId: r.ruleSetVersionId,
  evaluationSnapshot: r.evaluationSnapshot,
  createdAt: r.createdAt,
});

const toGuruResponse = (r: typeof guruResponses.$inferSelect): GuruResponseRecord => ({
  id: r.id,
  applicationId: r.applicationId,
  response: r.response,
  reason: r.reason,
  recordedById: r.recordedById,
  recordedAt: r.recordedAt,
});
