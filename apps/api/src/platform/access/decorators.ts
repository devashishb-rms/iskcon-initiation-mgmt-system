import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@iskcon/contracts';
import type { Request } from 'express';
import type { AuthUser } from '../tenancy/request-context';

export const PUBLIC_KEY = 'access:public';
export const AUTHENTICATED_KEY = 'access:authenticated';
export const PERMISSIONS_KEY = 'access:permissions';
export const NO_MFA_KEY = 'access:no-mfa';

/** No sign-in needed (login, health). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);
/** Any signed-in person; the handler does its own object-level checks. */
export const Authenticated = (): MethodDecorator & ClassDecorator => SetMetadata(AUTHENTICATED_KEY, true);
/** The caller needs at least one of these permissions (see ROLE_PERMISSIONS). */
export const RequirePermission = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
/** Usable before the second factor is proven (the MFA endpoints themselves). */
export const AllowWithoutMfa = (): MethodDecorator & ClassDecorator => SetMetadata(NO_MFA_KEY, true);

/** The signed-in person, set by the session guard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { authUser?: AuthUser }>();
  if (!req.authUser) throw new Error('CurrentUser used on a public route');
  return req.authUser;
});
