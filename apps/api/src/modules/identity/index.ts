// Public surface of the identity module. Other modules import only from here.
export { IdentityModule } from './identity.module';
export { UsersService, type NewUser } from './application/users.service';
export type { UserWithRoles } from './domain/user';
export { normalizeIdentifier, normalizePhone } from './domain/identifier';
export { SESSION_COOKIE, CSRF_HEADER, CSRF_VALUE } from './http/session.guard';
