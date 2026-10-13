import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { needsMfa, can, type Permission } from '@iskcon/contracts';
import type { Request } from 'express';
import { Forbidden, MfaRequired, Unauthenticated } from '../../../common/errors';
import {
  AUTHENTICATED_KEY,
  NO_MFA_KEY,
  PERMISSIONS_KEY,
  PUBLIC_KEY,
} from '../../../platform/access/decorators';
import { RequestContextService, type AuthUser } from '../../../platform/tenancy/request-context';
import { SessionService } from '../application/session.service';

export const SESSION_COOKIE = 'sid';
export const CSRF_HEADER = 'x-requested-by';
export const CSRF_VALUE = 'iskcon-web';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * One guard for the three checks every request needs, in order: it is not a forged cross-site
 * request, the caller is signed in (and past the second factor if their role needs one), and they
 * hold the permission the route declares. A route that declares nothing is refused (secure by default).
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly ctx: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { authUser?: AuthUser }>();
    const meta = <T>(key: string): T | undefined => this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);

    // 1. CSRF: browsers cannot add a custom header cross-site without a CORS preflight, which we refuse.
    if (UNSAFE.has(req.method) && req.header(CSRF_HEADER) !== CSRF_VALUE) {
      throw new Forbidden('Missing request header');
    }

    if (meta<boolean>(PUBLIC_KEY)) return true;

    // 2. Who is this?
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const user = token ? await this.sessions.resolve(token) : undefined;
    if (!user) throw new Unauthenticated();
    this.ctx.setUser(user);
    req.authUser = user;

    if (needsMfa(user.roles) && !user.mfaVerified && !meta<boolean>(NO_MFA_KEY)) throw new MfaRequired();

    // 3. May they do this?
    const required = meta<Permission[]>(PERMISSIONS_KEY);
    if (required?.length) {
      if (!required.some((p) => can(user.roles, p))) throw new Forbidden();
      return true;
    }
    if (meta<boolean>(AUTHENTICATED_KEY)) return true;
    throw new Forbidden('This route declares no access rule');
  }
}
