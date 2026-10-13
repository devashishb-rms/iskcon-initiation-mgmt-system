import { Injectable } from '@nestjs/common';
import type { TimelineEvent } from '@iskcon/contracts';
import { ApplicationFacetProvider, type ApplicationFacet } from '../../../platform/facets/facets';
import { RegisterService } from './register.service';

/**
 * What the register adds to the application file: one timeline line, "entered in the register",
 * the entry that made the person initiated. It offers no actions.
 */
@Injectable()
@ApplicationFacetProvider()
export class RegisterFacet implements ApplicationFacet {
  constructor(private readonly register: RegisterService) {}

  async timeline(applicationId: string): Promise<TimelineEvent[]> {
    const entry = await this.register.findByApplication(applicationId);
    if (!entry) return [];
    return [
      {
        id: `register:${entry.id}`,
        at: entry.createdAt.toISOString(),
        kind: 'REGISTER',
        actor: null,
        summary: { code: 'timeline.register', params: { date: entry.initiatedOn, spiritualName: entry.spiritualName } },
      },
    ];
  }
}
