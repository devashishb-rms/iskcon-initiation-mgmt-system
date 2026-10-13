/** Content-Security-Policy with a per-request nonce for scripts. The API is reached through the same origin (/api). */
export function buildCsp(nonce: string, dev: boolean): string {
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': script,
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(dev ? ['ws:', 'wss:'] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

export const SESSION_COOKIE = 'sid';
export const PUBLIC_PATHS = ['/login'];

export type GateDecision = { action: 'next' } | { action: 'redirect'; to: string };

/**
 * Cookie-presence gate: a page load without a session cookie goes to /login. The API is the real
 * authority; a stale cookie is caught by the first API call (401 -> /login).
 */
export function gate(pathname: string, hasSessionCookie: boolean): GateDecision {
  if (PUBLIC_PATHS.includes(pathname)) return { action: 'next' };
  if (hasSessionCookie) return { action: 'next' };
  const to = pathname === '/' ? '/login' : `/login?next=${encodeURIComponent(pathname)}`;
  return { action: 'redirect', to };
}
