import { Injectable } from '@nestjs/common';
import { RequestContextService } from '../../../../platform/tenancy/request-context';
import type { UserWithRoles } from '../../../identity';

/**
 * Runs a read as a given person, inside the current system job. The modules that own the data apply
 * "what may THIS person see" themselves, so a reminder for a mentor can only ever count that mentor's
 * own candidates, and the notifications module needs no query of its own into other modules' tables.
 * This narrows what the job can see; it never widens it.
 */
@Injectable()
export class ScopedAsUser {
  constructor(private readonly ctx: RequestContextService) {}

  run<T>(user: UserWithRoles, fn: () => Promise<T>): Promise<T> {
    const base = this.ctx.current();
    return this.ctx.run(
      {
        ...base,
        user: {
          id: user.id,
          name: user.name,
          roles: user.roles,
          locale: user.locale,
          sessionId: 'scheduled-reminder',
          mfaVerified: true,
          mfaEnrolled: user.totpEnabledAt !== null,
        },
      },
      fn,
    );
  }
}
