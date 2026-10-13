import { Injectable } from '@nestjs/common';
import type { CeremonyDto } from '@iskcon/contracts';
import { RequestContextService } from '../../../platform/tenancy/request-context';
import { ApplicationAccess } from '../../../shared/application-ports';
import { GurusService } from '../../gurus';
import type { Ceremony } from '../domain/ceremony';
import { CeremoniesRepository } from '../infrastructure/ceremonies.repository';

/** Builds the `CeremonyDto`: adds the guru's name, and each attendee's name and current stage. */
@Injectable()
export class CeremonyPresenter {
  constructor(
    private readonly repo: CeremoniesRepository,
    private readonly gurus: GurusService,
    private readonly applications: ApplicationAccess,
    private readonly ctx: RequestContextService,
  ) {}

  async present(ceremonies: Ceremony[]): Promise<CeremonyDto[]> {
    if (!ceremonies.length) return [];
    const attendees = await this.repo.attendeesOf(
      this.ctx.tenantId,
      ceremonies.map((c) => c.id),
    );
    const [gurus, apps] = await Promise.all([
      this.gurus.findMany(ceremonies.map((c) => c.guruId)),
      this.applications.findMany([...new Set(attendees.map((a) => a.applicationId))]),
    ]);
    const guruName = new Map(gurus.map((g) => [g.id, g.name]));
    const appById = new Map(apps.map((a) => [a.id, a]));
    return ceremonies.map((c) => ({
      id: c.id,
      guru: { id: c.guruId, name: guruName.get(c.guruId) ?? '' },
      track: c.track,
      venue: c.venue,
      date: c.date,
      status: c.status,
      attendees: attendees
        .filter((a) => a.ceremonyId === c.id && appById.has(a.applicationId))
        .map((a) => {
          const app = appById.get(a.applicationId)!;
          return { applicationId: a.applicationId, candidateName: app.candidateName, present: a.present, spiritualName: a.spiritualName, stage: app.stage };
        })
        .sort((x, y) => x.candidateName.localeCompare(y.candidateName) || x.applicationId.localeCompare(y.applicationId)),
    }));
  }

  async presentOne(ceremony: Ceremony): Promise<CeremonyDto> {
    return (await this.present([ceremony]))[0]!;
  }
}
