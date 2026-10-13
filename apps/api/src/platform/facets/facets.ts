import { Global, Injectable, Module, SetMetadata, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
import type {
  ApplicationActions,
  DocumentDto,
  ExceptionDto,
  GuruResponseDto,
  RecommendationDto,
  TimelineEvent,
} from '@iskcon/contracts';
import type { DocumentType, RecordedException } from '@iskcon/rules-engine';
import type { ApplicationSummary } from '../../shared/application-ports';

/** What other modules know about an application that the checklist must read (keyed by application id). */
export interface EvidencePart {
  documents?: Map<string, DocumentType[]>;
  exceptions?: Map<string, RecordedException[]>;
}

/** The parts of the application file that belong to modules other than `candidates`. */
export interface FacetDetail {
  documents: DocumentDto[];
  exceptions: ExceptionDto[];
  latestRecommendation: RecommendationDto | null;
  latestGuruResponse: GuruResponseDto | null;
  /** Each module says which actions it offers the caller on this file; the rest default to false. */
  actions: Partial<ApplicationActions>;
}

/**
 * A module's contribution to the application file. The checklist, the detail screen and the
 * timeline ask every facet instead of importing the modules that own documents, exceptions and
 * recommendations. That keeps the module graph a tree (no cycles) and lets a new module add to the
 * file without editing the composer (open/closed).
 */
export interface ApplicationFacet {
  evidence?(applicationIds: string[]): Promise<EvidencePart>;
  detail?(application: ApplicationSummary): Promise<Partial<FacetDetail>>;
  timeline?(applicationId: string): Promise<TimelineEvent[]>;
}

const FACET_KEY = 'application-facet';
/** Class decorator: this provider contributes to the application file. */
export const ApplicationFacetProvider = (): ClassDecorator => SetMetadata(FACET_KEY, true);

@Injectable()
export class FacetRegistry implements OnApplicationBootstrap {
  private facets: ApplicationFacet[] = [];
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    this.facets = this.discovery
      .getProviders()
      .filter((w) => w.metatype && w.instance && this.reflector.get<boolean>(FACET_KEY, w.metatype))
      .map((w) => w.instance as ApplicationFacet);
  }

  /** Merges every facet's evidence for a set of applications. */
  async evidence(applicationIds: string[]): Promise<Required<EvidencePart>> {
    const parts = await Promise.all(this.facets.map((f) => f.evidence?.(applicationIds)));
    const documents = new Map<string, DocumentType[]>();
    const exceptions = new Map<string, RecordedException[]>();
    for (const p of parts) {
      p?.documents?.forEach((v, k) => documents.set(k, [...(documents.get(k) ?? []), ...v]));
      p?.exceptions?.forEach((v, k) => exceptions.set(k, [...(exceptions.get(k) ?? []), ...v]));
    }
    return { documents, exceptions };
  }

  async detail(application: ApplicationSummary): Promise<FacetDetail> {
    const parts = await Promise.all(this.facets.map((f) => f.detail?.(application)));
    const out: FacetDetail = { documents: [], exceptions: [], latestRecommendation: null, latestGuruResponse: null, actions: {} };
    for (const p of parts) {
      if (!p) continue;
      if (p.documents) out.documents.push(...p.documents);
      if (p.exceptions) out.exceptions.push(...p.exceptions);
      if (p.latestRecommendation !== undefined) out.latestRecommendation = p.latestRecommendation;
      if (p.latestGuruResponse !== undefined) out.latestGuruResponse = p.latestGuruResponse;
      if (p.actions) Object.assign(out.actions, p.actions);
    }
    return out;
  }

  async timeline(applicationId: string): Promise<TimelineEvent[]> {
    const parts = await Promise.all(this.facets.map((f) => f.timeline?.(applicationId)));
    return parts.flatMap((p) => p ?? []);
  }
}

@Global()
@Module({ imports: [DiscoveryModule], providers: [FacetRegistry], exports: [FacetRegistry] })
export class FacetsModule {}
