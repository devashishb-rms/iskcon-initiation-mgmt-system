# Web app

Next.js 15 (App Router), React 19, TanStack Query. It talks only to the API through `/api/*` (a rewrite in
`next.config.mjs`), so session cookies are first-party and no CORS is needed. Request and response shapes come from
`@iskcon/contracts`; the app never redefines them.

## Run

```bash
pnpm --filter @iskcon/api dev            # API on :4000 (see docs/operations.md for first-time setup)
pnpm --filter @iskcon/web dev            # http://localhost:3000
```

| Variable | When | Meaning |
| --- | --- | --- |
| `API_URL` | **build** time | Where `/api/*` is proxied (default `http://localhost:4000`). Compiled into the build; in Docker it is a build argument. |
| `NEXT_STANDALONE` | build | `1` produces `.next/standalone` for the container image. |
| `NEXT_DIST_DIR` | build | Alternative build directory (lets a second build sit beside `.next`). |
| `WEB_URL`, `API_LOG`, `E2E_STATE_DIR`, `PW_CHROMIUM_PATH` | e2e only | See below. |

## Layout

```
src/app            Routes only: layouts, route files that render a feature page
  (app)/…          Signed-in area; login/ and mfa/ are public
src/features       One folder per screen group (application, candidates, ceremonies, imports, notifications,
                   people, queue, register, rules, audit, auth): pages, panels and hooks for that screen
src/components     ui/ (Button, Dialog, Field, Table, Tabs, Toast, …) and layout/ (shell, nav)
src/lib/api        One small module per API area on top of request.ts (CSRF header, problem+json -> ApiError,
                   response validation with the contract schemas, 401/MFA handling)
src/i18n           en.json, bn.json, hi.json, provider.tsx, core.ts
src/middleware.ts  Per-request CSP nonce and the signed-in gate
e2e/               Playwright specs run against the real API
```

## Security

Content-Security-Policy with a per-request nonce and `strict-dynamic` (`src/lib/csp.ts`), `X-Frame-Options: DENY`,
`nosniff`, strict referrer policy, no `dangerouslySetInnerHTML` (ESLint forbids it). Every state-changing request
sends `X-Requested-By: iskcon-web`. Who may do what is decided by the API; the app only hides what a role cannot use.

## Languages

English, Bengali, Hindi. All user-visible text is a key in the three catalogues; API errors, field-error codes,
timeline entries, notification and import messages arrive as codes and are translated here. `catalogue.test.ts`
fails the build if a key is missing from any language or a placeholder differs. To add a language: add it to
`locale` in `packages/contracts`, copy `en.json` to `<code>.json`, register it in `src/i18n/core.ts`, translate.
Bengali and Hindi wording should be reviewed by a devotee of the temple before go-live.

## Add a screen

1. Add the API calls in `src/lib/api/<area>.ts` using contract schemas.
2. Build the page in `src/features/<area>/` from `components/ui`; handle loading, empty and error states.
3. Add the route file in `src/app/(app)/<route>/page.tsx` and a nav entry gated by permission.
4. Add its keys to all three catalogues. Add a unit test for logic and an e2e spec for the flow.

## Tests

```bash
pnpm --filter @iskcon/web test          # vitest, no server needed
pnpm --filter @iskcon/web lint && pnpm --filter @iskcon/web typecheck
```

End-to-end (real API and database, Chromium from `PW_CHROMIUM_PATH`, default `/opt/pw-browsers/chromium`):

1. Fresh database; `pnpm db:migrate && pnpm db:seed` with `DELIVERY_MODE=console`.
2. Start the API with its output in `/tmp/api.log` (`API_LOG`): the specs read sign-in codes from it.
3. `pnpm --filter @iskcon/web build && pnpm --filter @iskcon/web start`, then `pnpm --filter @iskcon/web e2e`.
   `SCREENSHOTS=1` also refreshes `e2e/screenshots` at 390px and 1280px.

The specs share the seeded data and run in order, so use a fresh database for each run.

## Container

```bash
docker build -f apps/web/Dockerfile --build-arg API_URL=http://api:4000 -t iskcon-web .
```

Non-root, standalone server, health check on `/login`.
