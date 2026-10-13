import { Injectable } from '@nestjs/common';
import type { PackagePreview } from '@iskcon/contracts';
import { Conflict } from '../../../common/errors';
import { Clock } from '../../../platform/clock/clock';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { TenantDirectory } from '../../../platform/tenancy/tenancy.module';
import { AuditService } from '../../audit';
import { ApplicationsQueryService, type ApplicationWithCandidate } from '../../candidates';
import { ChecklistService, type ChecklistResult } from '../../checklist';
import { DocumentsService } from '../../documents';
import { GurusService } from '../../gurus';
import { DOCUMENT_LABELS, unmetItemIds } from '../domain/checklist-text';
import { longDate } from '../domain/format';
import { canExportPackage } from '../domain/stage-rules';
import { PackageExportsRepository } from '../infrastructure/package-exports.repository';
import { PackageArchive, type ArchiveEntry } from '../infrastructure/package-archive';
import { PackageCoverRenderer } from '../infrastructure/package-cover.renderer';

export interface ZipFile {
  filename: string;
  content: Buffer;
}

/**
 * The hand-over package for the guru's office: a cover sheet and the documents on file. It is useful
 * even when the file is incomplete, so exporting never fails for missing documents: it says what is
 * missing (on the cover, in the audit line and in `package_exports`) and goes on.
 */
@Injectable()
export class PackageService {
  constructor(
    private readonly queries: ApplicationsQueryService,
    private readonly checklist: ChecklistService,
    private readonly documents: DocumentsService,
    private readonly gurus: GurusService,
    private readonly tenants: TenantDirectory,
    private readonly cover: PackageCoverRenderer,
    private readonly archive: PackageArchive,
    private readonly repo: PackageExportsRepository,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
    private readonly clock: Clock,
  ) {}

  async preview(applicationId: string): Promise<PackagePreview> {
    const { check } = await this.load(applicationId);
    return {
      missingDocuments: check.evaluation.missingDocuments,
      unmetItems: unmetItemIds(check.evaluation),
      generatedAt: this.clock.now().toISOString(),
    };
  }

  async export(applicationId: string): Promise<ZipFile> {
    const { app, check } = await this.load(applicationId);
    const tenantId = this.ctx.tenantId;
    const user = this.ctx.user();
    const [tenant, guru, files] = await Promise.all([
      this.tenants.byId(tenantId),
      app.guruId ? this.gurus.get(app.guruId) : undefined,
      this.documents.listForExport(applicationId),
    ]);
    const missing = check.evaluation.missingDocuments;

    const cover = await this.cover.render({
      templeName: tenant?.name ?? '',
      candidateName: app.candidate.name,
      guruName: guru?.name ?? null,
      track: app.track,
      stage: app.stage,
      ruleSet: { name: check.ruleVersion.ruleSetName, version: check.ruleVersion.version },
      evaluation: check.evaluation,
      generatedOn: longDate(this.clock.now(), tenant?.timezone ?? 'Asia/Kolkata'),
      generatedBy: user.name,
      included: files.map((f) => ({ type: DOCUMENT_LABELS[f.document.type], filename: f.document.filename })),
      missing: missing.map((t) => DOCUMENT_LABELS[t]),
    });

    const entries: ArchiveEntry[] = [{ name: '00-cover.pdf', content: cover }];
    const used = new Set<string>();
    for (const [i, f] of files.entries()) {
      entries.push({ name: this.entryName(i + 1, f.document.type, f.document.filename, used), content: await f.open() });
    }
    const content = await this.archive.build(entries);

    await this.repo.insert({ tenantId, applicationId, missingDocuments: missing, exportedById: user.id });
    await this.audit.record({
      action: 'package.exported',
      entityType: 'application',
      entityId: applicationId,
      applicationId,
      detail: { missingDocuments: missing, unmetItems: unmetItemIds(check.evaluation), documentsIncluded: files.length },
    });
    return { filename: `initiation-file-${applicationId.slice(0, 8)}.zip`, content };
  }

  private async load(applicationId: string): Promise<{ app: ApplicationWithCandidate; check: ChecklistResult }> {
    const app = await this.queries.get(applicationId); // 404 unless the caller may see the file
    if (!canExportPackage(app)) {
      throw new Conflict('CONFLICT', 'The package can be prepared once the file has been submitted', { stage: app.stage, status: app.status });
    }
    return { app, check: await this.checklist.evaluateOne(app) };
  }

  /** `documents/01-ESSAY-name.pdf`: numbered so two files with the same name never collide, and no path from user input. */
  private entryName(n: number, type: string, filename: string, used: Set<string>): string {
    // eslint-disable-next-line no-control-regex -- control characters must not reach a zip entry name
    const safe = filename.replace(/[\\/\u0000-\u001f]/g, '_');
    let name = `documents/${String(n).padStart(2, '0')}-${type}-${safe}`;
    while (used.has(name)) name = `${name}_`;
    used.add(name);
    return name;
  }
}
