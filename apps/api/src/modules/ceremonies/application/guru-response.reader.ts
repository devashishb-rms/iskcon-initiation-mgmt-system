import { Injectable } from '@nestjs/common';
import { FacetRegistry } from '../../../platform/facets/facets';
import type { ApplicationSummary } from '../../../shared/application-ports';
import type { LatestGuruResponse } from '../domain/ceremony';

/**
 * What the guru's office last said about an application. That answer is the `recommendations`
 * module's data, so this module does not read it: it asks through a port. The default
 * implementation asks the application-file facets (the same answer the detail screen shows); tests
 * may bind an implementation that reads the table directly. Keeps `ceremonies` free of any
 * dependency on `recommendations`.
 */
export abstract class GuruResponseReader {
  abstract latest(application: ApplicationSummary): Promise<LatestGuruResponse>;
}

@Injectable()
export class FacetGuruResponseReader extends GuruResponseReader {
  constructor(private readonly facets: FacetRegistry) {
    super();
  }

  async latest(application: ApplicationSummary): Promise<LatestGuruResponse> {
    return (await this.facets.detail(application)).latestGuruResponse?.response ?? null;
  }
}
