/** @type {import('next').NextConfig} */
// API_URL is read when the app is BUILT (rewrites are compiled into the routes manifest): pass it as a build argument.
const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  // NEXT_DIST_DIR lets a second build live beside the default one (used by the e2e run).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // The container image sets NEXT_STANDALONE=1: a self-contained server in .next/standalone (workspace packages included).
  ...(process.env.NEXT_STANDALONE
    ? { output: 'standalone', outputFileTracingRoot: new URL('../../', import.meta.url).pathname }
    : {}),
  poweredByHeader: false,
  // @iskcon/contracts ships CommonJS; Next bundles it as-is.
  async rewrites() {
    // The browser only ever talks to this origin; cookies stay first-party and no CORS is needed.
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  async headers() {
    // The Content-Security-Policy (with a per-request nonce) is set in src/middleware.ts.
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
