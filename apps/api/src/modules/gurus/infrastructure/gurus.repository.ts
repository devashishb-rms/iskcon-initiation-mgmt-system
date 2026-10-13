import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DbService } from '../../../database/database.module';
import { gurus } from '../../../database/schema';

export interface Guru {
  id: string;
  name: string;
  active: boolean;
}

@Injectable()
export class GurusRepository {
  constructor(private readonly db: DbService) {}

  list(tenantId: string): Promise<Guru[]> {
    return this.db.client
      .select({ id: gurus.id, name: gurus.name, active: gurus.active })
      .from(gurus)
      .where(eq(gurus.tenantId, tenantId))
      .orderBy(gurus.name);
  }

  async findMany(tenantId: string, ids: string[]): Promise<Guru[]> {
    if (!ids.length) return [];
    return this.db.client
      .select({ id: gurus.id, name: gurus.name, active: gurus.active })
      .from(gurus)
      .where(and(eq(gurus.tenantId, tenantId), inArray(gurus.id, ids)));
  }

  async findByName(tenantId: string, name: string): Promise<Guru | undefined> {
    const [row] = await this.db.client
      .select({ id: gurus.id, name: gurus.name, active: gurus.active })
      .from(gurus)
      .where(and(eq(gurus.tenantId, tenantId), eq(gurus.name, name)))
      .limit(1);
    return row;
  }

  async insert(tenantId: string, name: string): Promise<Guru> {
    const [row] = await this.db.client.insert(gurus).values({ tenantId, name }).returning();
    return { id: row!.id, name: row!.name, active: row!.active };
  }

  async update(tenantId: string, id: string, patch: { name?: string; active?: boolean }): Promise<void> {
    await this.db.client.update(gurus).set(patch).where(and(eq(gurus.tenantId, tenantId), eq(gurus.id, id)));
  }
}
