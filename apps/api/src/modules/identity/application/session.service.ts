import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { needsMfa, type SessionResponse } from '@iskcon/contracts';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { Clock } from '../../../platform/clock/clock';
import { Sealer } from '../../../platform/security/sealer';
import { RequestContextService, type AuthUser } from '../../../platform/tenancy/request-context';
import { TenantDirectory } from '../../../platform/tenancy/tenancy.module';
import { SessionsRepository, type SessionRow } from '../infrastructure/sessions.repository';
import { UsersRepository, type UserWithRoles } from '../infrastructure/users.repository';

const TOUCH_AFTER_MS = 60_000;

@Injectable()
export class SessionService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly sessions: SessionsRepository,
    private readonly users: UsersRepository,
    private readonly clock: Clock,
    private readonly ctx: RequestContextService,
    private readonly tenants: TenantDirectory,
  ) {}

  /** Creates a session and returns the raw token for the cookie. The token itself is never stored. */
  async issue(user: UserWithRoles, mfaVerified: boolean): Promise<{ token: string; session: SessionRow }> {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const session = await this.sessions.insert({
      tenantId: user.tenantId,
      userId: user.id,
      tokenHash: Sealer.sha256(token),
      mfaVerifiedAt: mfaVerified ? now : null,
      expiresAt: new Date(now.getTime() + this.env.SESSION_TTL_HOURS * 3_600_000),
      ip: this.ctx.peek()?.ip ?? null,
      userAgent: this.ctx.peek()?.userAgent?.slice(0, 200) ?? null,
    });
    return { token, session };
  }

  /** Resolves a cookie value to the signed-in person, or undefined. */
  async resolve(token: string): Promise<AuthUser | undefined> {
    const now = this.clock.now();
    const session = await this.sessions.findActiveByHash(Sealer.sha256(token), now);
    if (!session || session.tenantId !== this.ctx.tenantId) return undefined;
    const user = await this.users.findById(session.tenantId, session.userId);
    if (!user || !user.active) return undefined;
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) await this.sessions.touch(session.id, now);

    return {
      id: user.id,
      name: user.name,
      roles: user.roles,
      locale: user.locale,
      sessionId: session.id,
      mfaVerified: session.mfaVerifiedAt !== null,
      mfaEnrolled: user.totpEnabledAt !== null,
    };
  }

  async describe(user: AuthUser): Promise<SessionResponse> {
    const tenant = await this.tenants.byId(this.ctx.tenantId);
    const required = needsMfa(user.roles);
    return {
      user: { id: user.id, name: user.name, roles: user.roles, locale: user.locale as 'en' | 'bn' | 'hi' },
      tenant: { slug: tenant?.slug ?? '', name: tenant?.name ?? '', timezone: tenant?.timezone ?? 'Asia/Kolkata' },
      mfa: { required, enrolled: user.mfaEnrolled, verified: !required || user.mfaVerified },
    };
  }

  markMfaVerified(sessionId: string): Promise<void> {
    return this.sessions.markMfaVerified(sessionId, this.clock.now());
  }
  revoke(sessionId: string): Promise<void> {
    return this.sessions.revoke(sessionId, this.clock.now());
  }
  revokeAllFor(userId: string): Promise<void> {
    return this.sessions.revokeAllForUser(this.ctx.tenantId, userId, this.clock.now());
  }
}
