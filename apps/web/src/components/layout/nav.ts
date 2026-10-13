import type { Permission, Role } from '@iskcon/contracts';
import type { MessageKey } from '@/i18n/core';

export interface NavItem {
  href: string;
  label: MessageKey;
  /** Shown when at least one of these is held. */
  anyOf: Permission[];
  /** Also active for these path prefixes. */
  match?: string[];
}

/** One list for every role; the permission map decides what each person sees. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/queue', label: 'nav.queue', anyOf: ['recommendation:decide'] },
  { href: '/candidates', label: 'nav.candidates', anyOf: ['candidate:read:any', 'candidate:read:assigned'], match: ['/candidates'] },
  { href: '/ceremonies', label: 'nav.ceremonies', anyOf: ['ceremony:read'], match: ['/ceremonies'] },
  { href: '/register', label: 'nav.register', anyOf: ['register:read'] },
  { href: '/rules', label: 'nav.rules', anyOf: ['ruleset:read'] },
  { href: '/import', label: 'nav.import', anyOf: ['import:run'] },
  { href: '/people', label: 'nav.people', anyOf: ['people:manage'] },
  { href: '/audit', label: 'nav.audit', anyOf: ['audit:read'] },
];

export function navItemsFor(can: (p: Permission) => boolean): NavItem[] {
  return NAV_ITEMS.filter((i) => i.anyOf.some(can));
}

export const isCandidateOnly = (roles: readonly Role[]): boolean => roles.length > 0 && roles.every((r) => r === 'CANDIDATE');

export function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  return (item.match ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The catalogue key for the browser tab title of a signed-in path. */
export function titleKeyFor(pathname: string): MessageKey | null {
  if (pathname === '/path' || pathname.startsWith('/path/')) return 'path.tab.path';
  if (pathname === '/notifications') return 'notifications.title';
  const item = NAV_ITEMS.find((i) => isActive(i, pathname));
  return item ? item.label : null;
}
