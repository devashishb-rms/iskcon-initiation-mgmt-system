import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, gate, SESSION_COOKIE } from '@/lib/csp';

export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV !== 'production');

  const decision = gate(req.nextUrl.pathname, req.cookies.has(SESSION_COOKIE));
  if (decision.action === 'redirect') {
    const res = NextResponse.redirect(new URL(decision.to, req.url));
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: '/((?!api/|_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
