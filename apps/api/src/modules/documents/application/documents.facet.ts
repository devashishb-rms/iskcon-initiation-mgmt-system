import { Injectable } from '@nestjs/common';
import { can, type TimelineEvent } from '@iskcon/contracts';
import { AppError } from '../../../common/errors';
import { ApplicationFacetProvider, type ApplicationFacet, type EvidencePart, type FacetDetail } from '../../../platform/facets/facets';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationAccess, type ApplicationSummary } from '../../../shared/application-ports';
import { UsersService } from '../../identity';
import { DocumentsRepository } from '../infrastructure/documents.repository';
import { DocumentsService } from './documents.service';

/** What this module adds to the application file: the checklist's document evidence, the list, the timeline and `canUpload`. */
@Injectable()
@ApplicationFacetProvider()
export class DocumentsFacet implements ApplicationFacet {
  constructor(
    private readonly repo: DocumentsRepository,
    private readonly documents: DocumentsService,
    private readonly access: ApplicationAccess,
    private readonly users: UsersService,
    private readonly ctx: RequestContextService,
  ) {}

  async evidence(applicationIds: string[]): Promise<EvidencePart> {
    return { documents: await this.repo.typesByApplications(this.ctx.tenantId, applicationIds) };
  }

  async detail(app: ApplicationSummary): Promise<Partial<FacetDetail>> {
    const roles = this.ctx.current().user?.roles ?? []; // no actions for system work (event handlers, schedulers)
    const [documents, mayContribute] = await Promise.all([
      this.documents.listFor(app),
      can(roles, 'document:upload') && app.status === 'OPEN' ? this.canContribute(app.id) : false,
    ]);
    return { documents, actions: { canUpload: mayContribute } };
  }

  async timeline(applicationId: string): Promise<TimelineEvent[]> {
    const tenantId = this.ctx.tenantId;
    const [live, deleted] = await Promise.all([
      this.repo.listByApplication(tenantId, applicationId, true),
      this.repo.deletedByApplication(tenantId, applicationId),
    ]);
    const names = new Map((await this.users.findMany(live.map((d) => d.uploadedById))).map((u) => [u.id, u.name]));
    const uploads = live.map<TimelineEvent>((d) => ({
      id: `document:${d.id}`,
      at: d.uploadedAt.toISOString(),
      kind: 'DOCUMENT',
      actor: names.get(d.uploadedById) ?? null,
      summary: { code: 'timeline.document.uploaded', params: { type: d.type, filename: d.filename } },
    }));
    const removals = deleted.map<TimelineEvent>((d) => ({
      id: `document-removed:${d.id}`,
      at: d.deletedAt!.toISOString(),
      kind: 'DOCUMENT',
      actor: null,
      summary: { code: 'timeline.document.removed', params: { type: d.type } },
    }));
    return [...uploads, ...removals];
  }

  private async canContribute(applicationId: string): Promise<boolean> {
    try {
      await this.access.assertCanContribute(applicationId);
      return true;
    } catch (e) {
      if (e instanceof AppError) return false;
      throw e;
    }
  }
}
