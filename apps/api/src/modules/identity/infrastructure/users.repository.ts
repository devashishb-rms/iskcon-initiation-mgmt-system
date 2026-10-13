import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Role } from '@iskcon/contracts';
import { DbService } from '../../../database/database.module';
import { userRoles, users } from '../../../database/schema';
import type { UserWithRoles } from '../domain/user';

export type UserRow = typeof users.$inferSelect;
export type { UserWithRoles };

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DbService) {}

  private async withRoles(rows: UserRow[]): Promise<UserWithRoles[]> {
    if (!rows.length) return [];
    const roles = await this.db.client
      .select()
      .from(userRoles)
      .where(inArray(userRoles.userId, rows.map((r) => r.id)));
    return rows.map((r) => ({ ...r, roles: roles.filter((x) => x.userId === r.id).map((x) => x.role) }));
  }

  async findById(tenantId: string, id: string): Promise<UserWithRoles | undefined> {
    const rows = await this.db.client
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, id)))
      .limit(1);
    return (await this.withRoles(rows))[0];
  }

  async findByIds(tenantId: string, ids: string[]): Promise<UserWithRoles[]> {
    if (!ids.length) return [];
    return this.withRoles(
      await this.db.client.select().from(users).where(and(eq(users.tenantId, tenantId), inArray(users.id, ids))),
    );
  }

  async findByContact(tenantId: string, kind: 'email' | 'phone', value: string): Promise<UserWithRoles | undefined> {
    const column = kind === 'email' ? users.email : users.phone;
    const rows = await this.db.client
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(column, value)))
      .limit(1);
    return (await this.withRoles(rows))[0];
  }

  async list(tenantId: string, role?: Role): Promise<UserWithRoles[]> {
    const rows = role
      ? await this.db.client
          .select({ u: users })
          .from(users)
          .innerJoin(userRoles, eq(userRoles.userId, users.id))
          .where(and(eq(users.tenantId, tenantId), eq(userRoles.role, role)))
          .orderBy(users.name)
          .then((r) => r.map((x) => x.u))
      : await this.db.client.select().from(users).where(eq(users.tenantId, tenantId)).orderBy(users.name);
    return this.withRoles(rows);
  }

  async insert(row: typeof users.$inferInsert): Promise<UserRow> {
    const [created] = await this.db.client.insert(users).values(row).returning();
    return created!;
  }

  async update(tenantId: string, id: string, patch: Partial<typeof users.$inferInsert>): Promise<void> {
    await this.db.client
      .update(users)
      .set({ ...patch, updatedAt: sql`now()` as unknown as Date })
      .where(and(eq(users.tenantId, tenantId), eq(users.id, id)));
  }

  async setRoles(tenantId: string, userId: string, roles: Role[]): Promise<void> {
    await this.db.client.delete(userRoles).where(and(eq(userRoles.tenantId, tenantId), eq(userRoles.userId, userId)));
    if (roles.length) {
      await this.db.client.insert(userRoles).values(roles.map((role) => ({ tenantId, userId, role })));
    }
  }
}
