import { Injectable } from '@nestjs/common';
import type { Role } from '@iskcon/contracts';
import { Conflict, NotFound, ValidationFailed } from '../../../common/errors';
import { AuditService } from '../../audit';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { normalizePhone } from '../domain/identifier';
import { UsersRepository, type UserWithRoles } from '../infrastructure/users.repository';

export interface NewUser {
  name: string;
  email?: string;
  phone?: string;
  roles: Role[];
  locale?: string;
}

/**
 * The identity module's public API for other modules: look people up, create a login. Everything
 * is scoped to the current tenant.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly ctx: RequestContextService,
    private readonly audit: AuditService,
  ) {}

  async get(id: string): Promise<UserWithRoles> {
    const user = await this.repo.findById(this.ctx.tenantId, id);
    if (!user) throw new NotFound('Person');
    return user;
  }

  find(id: string): Promise<UserWithRoles | undefined> {
    return this.repo.findById(this.ctx.tenantId, id);
  }

  findMany(ids: string[]): Promise<UserWithRoles[]> {
    return this.repo.findByIds(this.ctx.tenantId, [...new Set(ids)]);
  }

  /** People who hold a role, for pickers (mentors in "assign a mentor"). */
  listByRole(role: Role): Promise<UserWithRoles[]> {
    return this.repo.list(this.ctx.tenantId, role);
  }

  listAll(): Promise<UserWithRoles[]> {
    return this.repo.list(this.ctx.tenantId);
  }

  async findByContact(kind: 'email' | 'phone', value: string): Promise<UserWithRoles | undefined> {
    return this.repo.findByContact(this.ctx.tenantId, kind, kind === 'phone' ? (normalizePhone(value) ?? value) : value.toLowerCase());
  }

  async create(input: NewUser): Promise<UserWithRoles> {
    const tenantId = this.ctx.tenantId;
    const email = input.email?.toLowerCase();
    const phone = input.phone ? normalizePhone(input.phone) : undefined;
    if (input.phone && !phone) throw new ValidationFailed([{ path: 'phone', code: 'PHONE_INVALID' }]);
    if (email && (await this.repo.findByContact(tenantId, 'email', email))) {
      throw new Conflict('CONFLICT', 'A person with this email already exists', { field: 'email' });
    }
    if (phone && (await this.repo.findByContact(tenantId, 'phone', phone))) {
      throw new Conflict('CONFLICT', 'A person with this phone already exists', { field: 'phone' });
    }
    const row = await this.repo.insert({
      tenantId,
      name: input.name.trim(),
      email: email ?? null,
      phone: phone ?? null,
      locale: input.locale ?? 'en',
    });
    await this.repo.setRoles(tenantId, row.id, input.roles);
    await this.audit.record({ action: 'person.created', entityType: 'user', entityId: row.id, detail: { roles: input.roles } });
    return { ...row, roles: input.roles };
  }

  async update(
    id: string,
    patch: { name?: string; email?: string | null; phone?: string | null; locale?: string; active?: boolean; roles?: Role[] },
  ): Promise<UserWithRoles> {
    const tenantId = this.ctx.tenantId;
    const current = await this.get(id);
    const phone = patch.phone === undefined ? undefined : patch.phone === null ? null : normalizePhone(patch.phone);
    if (patch.phone && !phone) throw new ValidationFailed([{ path: 'phone', code: 'PHONE_INVALID' }]);
    const email = patch.email === undefined ? undefined : patch.email?.toLowerCase() ?? null;
    if (email && email !== current.email && (await this.repo.findByContact(tenantId, 'email', email))) {
      throw new Conflict('CONFLICT', 'A person with this email already exists', { field: 'email' });
    }
    if (phone && phone !== current.phone && (await this.repo.findByContact(tenantId, 'phone', phone))) {
      throw new Conflict('CONFLICT', 'A person with this phone already exists', { field: 'phone' });
    }
    await this.repo.update(tenantId, id, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    });
    if (patch.roles) await this.repo.setRoles(tenantId, id, patch.roles);
    await this.audit.record({
      action: 'person.updated',
      entityType: 'user',
      entityId: id,
      detail: { fields: Object.keys(patch), ...(patch.roles ? { roles: patch.roles } : {}) },
    });
    return this.get(id);
  }
}
