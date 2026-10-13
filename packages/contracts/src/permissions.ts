import type { Role } from './enums';

/**
 * What each role may do. The server enforces this (and object-level rules such as "a candidate sees
 * only their own file"); the web app reads the same map to decide which buttons to show.
 * The guru's office has no login and no role (PRD).
 */
export const PERMISSIONS = [
  'candidate:create',
  'candidate:read:any',
  'candidate:read:assigned', // mentors
  'candidate:read:own', // candidates
  'candidate:export',
  'application:set-practice', // mentor confirms the practice start date (R-1)
  'application:set-temple-facts', // shelter date, exam, course, first initiation date
  'application:advance', // ASPIRING -> SHELTER -> PREPARING
  'application:submit', // mentor readiness note -> APPLIED
  'application:change-guru',
  'note:monthly',
  'note:message',
  'document:upload',
  'document:read',
  'exception:record',
  'recommendation:decide', // president only
  'recommendation:letter',
  'package:export',
  'guru-response:record',
  'ruleset:read',
  'ruleset:edit',
  'ceremony:read',
  'ceremony:manage',
  'register:read',
  'register:export',
  'register:correct',
  'people:manage',
  'import:run',
  'audit:read',
  'notification:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CANDIDATE: ['candidate:read:own', 'document:upload', 'document:read', 'note:message', 'notification:read'],
  MENTOR: [
    'candidate:read:assigned',
    'application:set-practice',
    'application:submit',
    'note:monthly',
    'note:message',
    'document:upload',
    'document:read',
    'notification:read',
  ],
  PRESIDENT: [
    'candidate:read:any',
    'candidate:export',
    'document:read',
    'note:message',
    'recommendation:decide',
    'recommendation:letter',
    'package:export',
    'ruleset:read',
    'ceremony:read',
    'register:read',
    'register:export',
    'audit:read',
    'notification:read',
  ],
  COMMITTEE: [
    'candidate:create',
    'candidate:read:any',
    'candidate:export',
    'application:set-temple-facts',
    'application:advance',
    'application:change-guru',
    'note:message',
    'document:upload',
    'document:read',
    'exception:record',
    'recommendation:letter',
    'package:export',
    'guru-response:record',
    'ruleset:read',
    'ceremony:read',
    'register:read',
    'register:export',
    'audit:read',
    'notification:read',
  ],
  ADMIN: [
    'candidate:create',
    'candidate:read:any',
    'candidate:export',
    'application:set-temple-facts',
    'application:advance',
    'application:change-guru',
    'note:message',
    'document:upload',
    'document:read',
    'recommendation:letter',
    'package:export',
    'ruleset:read',
    'ruleset:edit',
    'ceremony:read',
    'ceremony:manage',
    'register:read',
    'register:export',
    'register:correct',
    'people:manage',
    'import:run',
    'audit:read',
    'notification:read',
  ],
};

export const can = (roles: readonly Role[], permission: Permission): boolean =>
  roles.some((r) => ROLE_PERMISSIONS[r].includes(permission));

/** Roles whose sign-in needs a second factor (NFR-5). */
export const MFA_ROLES: readonly Role[] = ['PRESIDENT', 'ADMIN'];
export const needsMfa = (roles: readonly Role[]): boolean => roles.some((r) => MFA_ROLES.includes(r));

/** The screen each role opens on after sign-in. */
export const HOME_BY_ROLE: Record<Role, string> = {
  CANDIDATE: '/path',
  MENTOR: '/candidates',
  PRESIDENT: '/queue',
  COMMITTEE: '/candidates',
  ADMIN: '/rules',
};
const ROLE_PRIORITY: Role[] = ['PRESIDENT', 'ADMIN', 'COMMITTEE', 'MENTOR', 'CANDIDATE'];
export const homeFor = (roles: readonly Role[]): string => {
  const first = ROLE_PRIORITY.find((r) => roles.includes(r));
  return first ? HOME_BY_ROLE[first] : '/login';
};
