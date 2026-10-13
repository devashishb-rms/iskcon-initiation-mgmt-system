import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, type SQL } from 'drizzle-orm';
import { DbService } from '../../../database/database.module';
import { registerEntries } from '../../../database/schema';
import type { NewRegisterEntry, RegisterEntry, RegisterFilter } from '../domain/register-entry';

/** `%` and `_` typed by a person are literal characters, not wildcards. */
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The only code that touches `register_entries`. There is deliberately no delete: the table forbids it. */
@Injectable()
export class RegisterRepository {
  constructor(private readonly db: DbService) {}

  async insertMany(tenantId: string, entries: NewRegisterEntry[]): Promise<RegisterEntry[]> {
    if (!entries.length) return [];
    const rows = await this.db.client
      .insert(registerEntries)
      .values(entries.map((e) => ({ ...e, tenantId })))
      .returning();
    return rows as RegisterEntry[];
  }

  async findById(tenantId: string, id: string, lock = false): Promise<RegisterEntry | undefined> {
    const q = this.db.client
      .select()
      .from(registerEntries)
      .where(and(eq(registerEntries.tenantId, tenantId), eq(registerEntries.id, id)))
      .limit(1);
    const [row] = lock ? await q.for('update') : await q;
    return row as RegisterEntry | undefined;
  }

  async findByApplicationIds(tenantId: string, applicationIds: string[]): Promise<RegisterEntry[]> {
    if (!applicationIds.length) return [];
    const rows = await this.db.client
      .select()
      .from(registerEntries)
      .where(and(eq(registerEntries.tenantId, tenantId), inArray(registerEntries.applicationId, applicationIds)));
    return rows as RegisterEntry[];
  }

  async updateSpiritualName(tenantId: string, id: string, spiritualName: string): Promise<void> {
    await this.db.client
      .update(registerEntries)
      .set({ spiritualName })
      .where(and(eq(registerEntries.tenantId, tenantId), eq(registerEntries.id, id)));
  }

  /** Newest initiation first; ties broken by name and id so paging is stable. */
  async search(tenantId: string, filter: RegisterFilter, page: number, pageSize: number): Promise<{ rows: RegisterEntry[]; total: number }> {
    const where = this.where(tenantId, filter);
    const rows = await this.db.client
      .select()
      .from(registerEntries)
      .where(where)
      .orderBy(...ORDER)
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [totalRow] = await this.db.client.select({ n: count() }).from(registerEntries).where(where);
    return { rows: rows as RegisterEntry[], total: Number(totalRow?.n ?? 0) };
  }

  /** Everything that matches, for exports. Capped so one request cannot read the whole table. */
  async searchAll(tenantId: string, filter: RegisterFilter, limit: number): Promise<RegisterEntry[]> {
    const rows = await this.db.client.select().from(registerEntries).where(this.where(tenantId, filter)).orderBy(...ORDER).limit(limit);
    return rows as RegisterEntry[];
  }

  private where(tenantId: string, f: RegisterFilter): SQL | undefined {
    const like = f.q ? `%${escapeLike(f.q)}%` : undefined;
    return and(
      eq(registerEntries.tenantId, tenantId),
      f.guruId ? eq(registerEntries.guruId, f.guruId) : undefined,
      f.track ? eq(registerEntries.track, f.track) : undefined,
      f.from ? gte(registerEntries.initiatedOn, f.from) : undefined,
      f.to ? lte(registerEntries.initiatedOn, f.to) : undefined,
      like ? or(ilike(registerEntries.candidateName, like), ilike(registerEntries.spiritualName, like)) : undefined,
    );
  }
}

const ORDER = [desc(registerEntries.initiatedOn), asc(registerEntries.spiritualName), asc(registerEntries.id)] as const;
