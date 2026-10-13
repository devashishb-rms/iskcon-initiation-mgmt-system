import { Injectable } from '@nestjs/common';
import { needsMfa, type SessionResponse } from '@iskcon/contracts';
import { UnitOfWork } from '../../../database/database.module';
import { AuditService } from '../../audit';
import { RequestContextService, type AuthUser } from '../../../platform/tenancy/request-context';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { TotpService } from './totp.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly totp: TotpService,
    private readonly audit: AuditService,
    private readonly ctx: RequestContextService,
    private readonly uow: UnitOfWork,
  ) {}

  requestCode(identifier: string): Promise<void> {
    return this.otp.request(identifier);
  }

  /** Verifies the code and opens a session. Roles that need a second factor start unverified. */
  async signIn(identifier: string, code: string): Promise<{ token: string; session: SessionResponse }> {
    const user = await this.otp.verify(identifier, code);
    const { token, session } = await this.uow.run(async () => {
      const issued = await this.sessions.issue(user, !needsMfa(user.roles));
      // The actor of this audit line is the person who just signed in.
      this.ctx.setUser({
        id: user.id,
        name: user.name,
        roles: user.roles,
        locale: user.locale,
        sessionId: issued.session.id,
        mfaVerified: !needsMfa(user.roles),
        mfaEnrolled: user.totpEnabledAt !== null,
      });
      await this.audit.record({ action: 'auth.sign-in', entityType: 'user', entityId: user.id });
      return issued;
    });
    const resolved = await this.sessions.resolve(token);
    return { token, session: await this.sessions.describe(resolved!) };
  }

  describe(user: AuthUser): Promise<SessionResponse> {
    return this.sessions.describe(user);
  }

  async signOut(user: AuthUser): Promise<void> {
    await this.sessions.revoke(user.sessionId);
    await this.audit.record({ action: 'auth.sign-out', entityType: 'user', entityId: user.id });
  }

  enrolMfa(user: AuthUser) {
    return this.totp.beginEnrolment(user.id);
  }

  async confirmMfaEnrolment(user: AuthUser, code: string): Promise<void> {
    await this.totp.confirmEnrolment(user.id, code);
    await this.sessions.markMfaVerified(user.sessionId);
    await this.audit.record({ action: 'auth.mfa-enrolled', entityType: 'user', entityId: user.id });
  }

  async verifyMfa(user: AuthUser, code: string): Promise<void> {
    await this.totp.verify(user.id, code);
    await this.sessions.markMfaVerified(user.sessionId);
  }
}
