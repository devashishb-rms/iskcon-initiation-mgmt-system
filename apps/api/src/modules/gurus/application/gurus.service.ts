import { Injectable } from '@nestjs/common';
import { Conflict, NotFound } from '../../../common/errors';
import { AuditService } from '../../audit';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { GurusRepository, type Guru } from '../infrastructure/gurus.repository';

export type { Guru };

/** The gurus a temple works with. Their names are data entered by the temple, never fixed in code. */
@Injectable()
export class GurusService {
  constructor(
    private readonly repo: GurusRepository,
    private readonly ctx: RequestContextService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<Guru[]> {
    return this.repo.list(this.ctx.tenantId);
  }

  findMany(ids: string[]): Promise<Guru[]> {
    return this.repo.findMany(this.ctx.tenantId, [...new Set(ids)]);
  }

  async get(id: string): Promise<Guru> {
    const [g] = await this.repo.findMany(this.ctx.tenantId, [id]);
    if (!g) throw new NotFound('Guru');
    return g;
  }

  findByName(name: string): Promise<Guru | undefined> {
    return this.repo.findByName(this.ctx.tenantId, name.trim());
  }

  async create(name: string): Promise<Guru> {
    const tenantId = this.ctx.tenantId;
    if (await this.repo.findByName(tenantId, name.trim())) {
      throw new Conflict('CONFLICT', 'A guru with this name already exists', { field: 'name' });
    }
    const guru = await this.repo.insert(tenantId, name.trim());
    await this.audit.record({ action: 'guru.created', entityType: 'guru', entityId: guru.id, detail: { name: guru.name } });
    return guru;
  }

  async update(id: string, patch: { name?: string; active?: boolean }): Promise<Guru> {
    await this.get(id);
    await this.repo.update(this.ctx.tenantId, id, { ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) });
    await this.audit.record({ action: 'guru.updated', entityType: 'guru', entityId: id, detail: patch });
    return this.get(id);
  }
}
