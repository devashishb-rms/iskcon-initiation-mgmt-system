import { Injectable } from '@nestjs/common';
import { CandidatesService } from '../../candidates';
import { MonthlyNoteLookup } from '../application/reminders/monthly-note-lookup';

/**
 * Reads monthly notes through the candidates module's public service. `listNotes` applies the
 * caller's visibility, so this must run as the mentor (see ScopedAsUser).
 * TODO: replace with a single `lastMonthlyNoteAt(applicationIds)` on the candidates module (see
 * REQUESTS.md): this reads every note of each application just to find one date.
 */
@Injectable()
export class CandidatesMonthlyNoteLookup extends MonthlyNoteLookup {
  constructor(private readonly candidates: CandidatesService) {
    super();
  }

  async lastMonthlyNoteAt(applicationIds: string[]): Promise<Map<string, Date>> {
    const latest = new Map<string, Date>();
    for (const id of applicationIds) {
      const dates = (await this.candidates.listNotes(id)).filter((n) => n.kind === 'MONTHLY').map((n) => new Date(n.createdAt));
      const newest = dates.sort((a, b) => b.getTime() - a.getTime())[0];
      if (newest) latest.set(id, newest);
    }
    return latest;
  }
}
