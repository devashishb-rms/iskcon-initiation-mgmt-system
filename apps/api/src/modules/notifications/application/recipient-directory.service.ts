import { Injectable } from '@nestjs/common';
import type { Role } from '@iskcon/contracts';
import { ApplicationAccess, type ApplicationSummary } from '../../../shared/application-ports';
import { UsersService, type UserWithRoles } from '../../identity';
import type { Recipient } from '../domain/recipient';

export interface ApplicationAudience {
  application: ApplicationSummary;
  /** The assigned mentor, if there is one and they can still be reached. */
  mentor: Recipient | null;
  /** The candidate, if they have a login and it is active. */
  candidate: Recipient | null;
}

export const toRecipient = (u: UserWithRoles): Recipient => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  locale: u.locale,
});

/**
 * Answers "who are the people for this message?" for planners. Inactive people are never returned,
 * so no planner has to remember to filter them. Application participants come through the shared
 * `ApplicationAccess` port, never from the candidates module's internals.
 */
@Injectable()
export class RecipientDirectory {
  constructor(
    private readonly users: UsersService,
    private readonly applications: ApplicationAccess,
  ) {}

  async withRole(role: Role): Promise<Recipient[]> {
    return (await this.users.listByRole(role)).filter((u) => u.active).map(toRecipient);
  }

  async forApplication(applicationId: string): Promise<ApplicationAudience | null> {
    const application = await this.applications.find(applicationId);
    if (!application) return null;
    const ids = [application.mentorId, application.candidateUserId].filter((id): id is string => Boolean(id));
    const people = new Map((await this.users.findMany(ids)).filter((u) => u.active).map((u) => [u.id, toRecipient(u)]));
    return {
      application,
      mentor: application.mentorId ? (people.get(application.mentorId) ?? null) : null,
      candidate: application.candidateUserId ? (people.get(application.candidateUserId) ?? null) : null,
    };
  }
}
