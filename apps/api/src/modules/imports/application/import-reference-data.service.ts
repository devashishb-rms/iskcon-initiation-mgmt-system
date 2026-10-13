import { Injectable } from '@nestjs/common';
import { GurusService } from '../../gurus';
import { UsersService } from '../../identity';
import type { PlanReference } from '../domain/plan';

/**
 * What the temple already has that an import must be checked against: its mentors and gurus (by the
 * identity and gurus modules' public services) and the e-mail addresses and phone numbers of people
 * who exist. Read once per preview or commit, not once per row.
 */
@Injectable()
export class ImportReferenceData {
  constructor(
    private readonly users: UsersService,
    private readonly gurus: GurusService,
  ) {}

  async load(): Promise<PlanReference> {
    const people = await this.users.listAll();
    return {
      mentors: people.filter((p) => p.active && p.roles.includes('MENTOR')).map((p) => ({ id: p.id, name: p.name, email: p.email })),
      gurus: await this.gurus.list(),
      existingEmails: new Set(people.flatMap((p) => (p.email ? [p.email.toLowerCase()] : []))),
      existingPhones: new Set(people.flatMap((p) => (p.phone ? [p.phone] : []))),
    };
  }
}
