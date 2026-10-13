import { Injectable } from '@nestjs/common';
import type { RegisterEntryDto } from '@iskcon/contracts';
import { GurusService } from '../../gurus';
import type { RegisterEntry } from '../domain/register-entry';

/** Turns register entries into the shape the API returns (adds the guru's name in one lookup). */
@Injectable()
export class RegisterPresenter {
  constructor(private readonly gurus: GurusService) {}

  async present(entries: RegisterEntry[]): Promise<RegisterEntryDto[]> {
    if (!entries.length) return [];
    const names = new Map((await this.gurus.findMany(entries.map((e) => e.guruId))).map((g) => [g.id, g.name]));
    return entries.map((e) => ({
      id: e.id,
      applicationId: e.applicationId,
      candidateName: e.candidateName,
      spiritualName: e.spiritualName,
      track: e.track,
      guru: { id: e.guruId, name: names.get(e.guruId) ?? '' },
      ceremonyId: e.ceremonyId,
      initiatedOn: e.initiatedOn,
    }));
  }
}
