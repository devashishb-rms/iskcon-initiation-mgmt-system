import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { RuleParams } from '@iskcon/rules-engine';
import { DbService } from '../../../database/database.module';
import { ruleSets, ruleSetVersions } from '../../../database/schema';

export interface RuleSetRow {
  id: string;
  guruId: string | null;
  name: string;
}
export interface RuleVersionRow {
  id: string;
  ruleSetId: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  params: RuleParams;
  note: string | null;
  createdById: string;
  createdAt: Date;
  publishedAt: Date | null;
}

@Injectable()
export class RuleSetsRepository {
  constructor(private readonly db: DbService) {}

  listSets(tenantId: string): Promise<RuleSetRow[]> {
    return this.db.client
      .select({ id: ruleSets.id, guruId: ruleSets.guruId, name: ruleSets.name })
      .from(ruleSets)
      .where(eq(ruleSets.tenantId, tenantId));
  }

  async findSet(tenantId: string, id: string): Promise<RuleSetRow | undefined> {
    const [row] = await this.db.client
      .select({ id: ruleSets.id, guruId: ruleSets.guruId, name: ruleSets.name })
      .from(ruleSets)
      .where(and(eq(ruleSets.tenantId, tenantId), eq(ruleSets.id, id)))
      .limit(1);
    return row;
  }

  async findForGuru(tenantId: string, guruId: string | null): Promise<RuleSetRow | undefined> {
    const [row] = await this.db.client
      .select({ id: ruleSets.id, guruId: ruleSets.guruId, name: ruleSets.name })
      .from(ruleSets)
      .where(and(eq(ruleSets.tenantId, tenantId), guruId ? eq(ruleSets.guruId, guruId) : isNull(ruleSets.guruId)))
      .limit(1);
    return row;
  }

  async insertSet(tenantId: string, guruId: string | null, name: string): Promise<RuleSetRow> {
    const [row] = await this.db.client
      .insert(ruleSets)
      .values({ tenantId, guruId, name })
      .onConflictDoNothing()
      .returning({ id: ruleSets.id, guruId: ruleSets.guruId, name: ruleSets.name });
    if (row) return row;
    const existing = await this.findForGuru(tenantId, guruId);
    return existing!;
  }

  private mapVersion(r: typeof ruleSetVersions.$inferSelect): RuleVersionRow {
    return { ...r, params: r.params as RuleParams };
  }

  async versionsOf(tenantId: string, setIds: string[]): Promise<RuleVersionRow[]> {
    if (!setIds.length) return [];
    const rows = await this.db.client
      .select()
      .from(ruleSetVersions)
      .where(and(eq(ruleSetVersions.tenantId, tenantId), inArray(ruleSetVersions.ruleSetId, setIds)))
      .orderBy(desc(ruleSetVersions.version));
    return rows.map((r) => this.mapVersion(r));
  }

  async findVersion(tenantId: string, id: string): Promise<RuleVersionRow | undefined> {
    const [row] = await this.db.client
      .select()
      .from(ruleSetVersions)
      .where(and(eq(ruleSetVersions.tenantId, tenantId), eq(ruleSetVersions.id, id)))
      .limit(1);
    return row ? this.mapVersion(row) : undefined;
  }

  async findVersions(tenantId: string, ids: string[]): Promise<RuleVersionRow[]> {
    if (!ids.length) return [];
    const rows = await this.db.client
      .select()
      .from(ruleSetVersions)
      .where(and(eq(ruleSetVersions.tenantId, tenantId), inArray(ruleSetVersions.id, ids)));
    return rows.map((r) => this.mapVersion(r));
  }

  async currentPublished(tenantId: string, setId: string): Promise<RuleVersionRow | undefined> {
    const [row] = await this.db.client
      .select()
      .from(ruleSetVersions)
      .where(
        and(eq(ruleSetVersions.tenantId, tenantId), eq(ruleSetVersions.ruleSetId, setId), eq(ruleSetVersions.status, 'PUBLISHED')),
      )
      .orderBy(desc(ruleSetVersions.version))
      .limit(1);
    return row ? this.mapVersion(row) : undefined;
  }

  async draftOf(tenantId: string, setId: string): Promise<RuleVersionRow | undefined> {
    const [row] = await this.db.client
      .select()
      .from(ruleSetVersions)
      .where(and(eq(ruleSetVersions.tenantId, tenantId), eq(ruleSetVersions.ruleSetId, setId), eq(ruleSetVersions.status, 'DRAFT')))
      .limit(1);
    return row ? this.mapVersion(row) : undefined;
  }

  async nextVersionNumber(setId: string): Promise<number> {
    const [r] = await this.db.client
      .select({ max: sql<number>`coalesce(max(${ruleSetVersions.version}), 0)` })
      .from(ruleSetVersions)
      .where(eq(ruleSetVersions.ruleSetId, setId));
    return Number(r?.max ?? 0) + 1;
  }

  async insertVersion(row: {
    tenantId: string;
    ruleSetId: string;
    version: number;
    status: 'DRAFT' | 'PUBLISHED';
    params: RuleParams;
    note: string | null;
    createdById: string;
    publishedAt?: Date;
  }): Promise<RuleVersionRow> {
    const [created] = await this.db.client.insert(ruleSetVersions).values(row).returning();
    return this.mapVersion(created!);
  }

  async updateDraft(tenantId: string, id: string, params: RuleParams, note: string | null): Promise<void> {
    await this.db.client
      .update(ruleSetVersions)
      .set({ params, note })
      .where(and(eq(ruleSetVersions.tenantId, tenantId), eq(ruleSetVersions.id, id), eq(ruleSetVersions.status, 'DRAFT')));
  }

  async publish(tenantId: string, id: string, at: Date): Promise<void> {
    await this.db.client
      .update(ruleSetVersions)
      .set({ status: 'PUBLISHED', publishedAt: at })
      .where(and(eq(ruleSetVersions.tenantId, tenantId), eq(ruleSetVersions.id, id), eq(ruleSetVersions.status, 'DRAFT')));
  }

  async deleteDraft(tenantId: string, id: string): Promise<void> {
    await this.db.client
      .delete(ruleSetVersions)
      .where(and(eq(ruleSetVersions.tenantId, tenantId), eq(ruleSetVersions.id, id), eq(ruleSetVersions.status, 'DRAFT')));
  }
}
