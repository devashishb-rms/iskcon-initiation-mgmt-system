# Architecture

This is the single reference for how the system is organised and why. Decisions that were weighed
and chosen are recorded as ADRs in `docs/adr/`. Read this before adding a module.

## 1. What the system is

A web application that takes an initiation candidate (ISKCON Newtown, Kolkata) from first contact to a
permanent register entry, checks each candidate against the GBC minimums and the chosen guru's own
rules, and gives the temple president a ready file to recommend. **The system never approves anyone.**
It shows a checklist; people decide; the guru's office has the last word and has no login.

Today it serves one temple. The next product is a SaaS that serves many temples from one deployment, so
the code is **tenant-aware but runs as one tenant** (ADR-0003).

## 2. Style: a modular monolith (ADR-0001)

One deployable API, one database, strictly separated modules. The three styles were weighed:

| | Monolith (plain) | **Modular monolith** (chosen) | SOA / microservices |
| --- | --- | --- | --- |
| Deploy units | 1 | **1** | 3 to 12 |
| Boundaries | by habit | **by rule, checked in CI** | by network |
| Transactions across features | trivial | **trivial** (one DB transaction) | sagas, eventual consistency |
| Operating cost for one temple | lowest | **lowest** | high (brokers, gateways, tracing, per-service CI) |
| Can a module become a service later | hard | **yes**: no one reads its tables, it talks by interface and events | already one |
| Failure mode | spaghetti | **a CI failure** | partial outages, distributed data bugs |

Why not microservices: a temple has hundreds of candidates, not millions of requests. The hard parts of
this domain are correctness and auditability (a decision and its audit line must commit together), which
a single transaction gives for free. Why not plain monolith: the SaaS phase needs clean seams, and the
product will keep growing rules, channels and report types.

**Cohesion versus difference.** Things that change together live in one module (a candidate, their
applications, stage events and notes: `candidates`). Things that change for different reasons or at
different speeds are separate (rule sets change when a guru's office changes its policy; ceremonies change
when the calendar does; notifications change when a channel is added). A module is a candidate for
extraction only if it has its own scaling or release need. Notifications and document storage are the
likely first two; both already sit behind ports and communicate by outbox events.

## 3. Module map

```
 apps/web (Next.js)  ──HTTP/JSON, cookie session──►  apps/api (NestJS)
                                                          │
        packages/contracts (zod: requests, responses, permissions, error codes)  ◄── shared by both
        packages/rules-engine (pure TypeScript: the checklist; no I/O, no clock) ◄── used by the API

 apps/api/src
  platform/    cross-cutting, no business rules:  tenancy · events (outbox) · access · delivery (mail, SMS)
               · security (sealing, hashing) · clock · health
  shared/      the kernel: ports implemented by `candidates` + the event catalogue
  database/    schema (one file per module that owns tables), unit of work, migrations
  modules/
    identity        users, roles, one-time-code sign-in, sessions, second factor, people admin
    audit           append-only audit log
    gurus           the gurus a temple works with
    rules           rule sets, versions, the GBC floor, resolving parameters for a guru
    candidates      candidates, applications, stage machine, facts, notes   (implements the ports)
    checklist       runs the rules engine for an application (reads rules, documents, recommendations)
    documents       uploads and private storage (S3-compatible or local)
    recommendations exceptions, the president's decision, the letter, the guru's answer, the package
    ceremonies      planning, attendance, completion
    register        the permanent register (written when a ceremony completes)
    notifications   reminders and messages: outbox subscriber, scheduler, in-app + email + SMS
    imports         spreadsheet import with preview and commit
    views           read models that compose several modules (application detail, queue, lists, timeline)
```

Dependencies point one way:

```
 views ──► candidates ──► checklist ──► rules · documents · recommendations
             ▲                              │
             └── ApplicationAccess / ApplicationWorkflow (ports in shared/) ◄── documents, recommendations,
                                                                                 ceremonies, notifications
 ceremonies ──► register          imports ──► candidates · gurus · identity        notifications ◄── events
```

`documents`, `recommendations` and `ceremonies` need "may this caller see application X" and "move X to
the next stage" from `candidates`, while `candidates` needs their data for the checklist. To avoid a cycle
they depend on the abstract classes in `shared/application-ports.ts`, which `candidates` implements
(dependency inversion).

### Rules that CI enforces (`pnpm check:boundaries`)

1. A module imports another module only through its `index.ts`.
2. A module reads and writes only the tables it owns (the ownership map is in the script and in the schema
   files). Everything else goes through the owner's public service.
3. `platform/`, `shared/`, `common/` never import from `modules/`.
4. Controllers do not import repositories. `domain/` imports nothing from Nest, the database or an outer layer.

## 4. Inside a module

```
modules/<name>/
  domain/           pure TypeScript: entities, value objects, state machines, policies. Unit tested, no I/O.
  application/      services (use cases): orchestrate domain + repositories + other modules' public API.
                    Open the transaction (UnitOfWork), write the audit line, publish events.
  infrastructure/   repositories (Drizzle queries), storage/mail adapters. Return plain data, not rows.
  http/             controllers: parse with a contracts schema, check permission, call ONE service method.
  <name>.module.ts  wiring
  index.ts          the public surface: the Nest module, services other modules may call, events, types
```

SOLID in practice:

* **Single responsibility.** A controller translates HTTP; a service is one use case; a repository is queries;
  the rules engine only evaluates. `AuthService` composes `OtpService`, `TotpService`, `SessionService`; none
  of them knows about cookies.
* **Open/closed.** A new eligibility rule is a new class registered in `rules-engine/src/registry.ts`;
  `evaluate()` is not edited. A new delivery channel is a new `Gateway` implementation.
* **Liskov.** `EmailGateway`, `SmsGateway`, `ObjectStore` have interchangeable implementations (console,
  SMTP, webhook, local disk, S3) that the tests swap freely.
* **Interface segregation.** Ports are small (`ApplicationAccess` is read; `ApplicationWorkflow` is write).
* **Dependency inversion.** Business code depends on abstract classes (`EmailGateway`, `ObjectStore`,
  `ApplicationAccess`, `TenantResolver`, `Clock`); Nest binds the real thing.

## 5. Data

* PostgreSQL 16. Drizzle ORM (typed SQL, no code generation step, no native engine binary). Migrations are
  plain SQL in `apps/api/drizzle/`, generated from `src/database/schema/` and applied by
  `pnpm --filter @iskcon/api prisma:migrate` (alias kept for the script name; it runs `src/database/migrate.ts`).
* Every table has `tenant_id`, a foreign key to `tenants`. Child tables use **composite foreign keys**
  `(tenant_id, parent_id)` so a row can never point at another temple's parent.
* Personal details exist only on `users` and `candidates`. No column for Aadhaar, caste, varna, race,
  ethnicity or marital status exists, and a migration check fails if one appears (NFR-1).
* Database triggers (migration `0001`) make `audit_log`, `recommendations` and `guru_responses` append-only,
  stop `register_entries` from being deleted, and freeze a rule version once published.
* Calendar dates (`shelter_date`, `initiated_on`) are `date` columns, handled as `YYYY-MM-DD` strings.
  Instants are `timestamptz`.

## 6. Transactions and events

* `UnitOfWork.run(fn)` wraps a use case in one transaction. Repositories ask `DbService.client`, which is the
  open transaction when there is one. Nested `run` calls join the outer transaction.
* A change, its audit line and its outbox event commit together or not at all.
* Events (`shared/events.ts`) are written to `outbox_events` in that transaction and delivered at least once
  by `OutboxDispatcher` (`SELECT … FOR UPDATE SKIP LOCKED`, safe on several instances). Handlers are marked
  `@OnDomainEvent('type')`, must be idempotent, are retried with back-off and parked as `DEAD` after 8 tries.
* Synchronous work that must be atomic (a ceremony completing writes register entries) is a direct call
  to the owning module's service inside the same transaction. Work that may lag (a reminder) is an event.

## 7. Security

* Sign-in by one-time code to email or phone; the code is stored as a keyed hash, expires in 10 minutes,
  works once, is locked after 5 wrong tries, and the request endpoint never says whether an account exists.
* Sessions are opaque random tokens in an `httpOnly`, `SameSite=Lax`, `Secure` cookie; only their SHA-256 is stored.
* President and administrators need a TOTP second factor (NFR-5): until proven, every route except the MFA
  routes answers `MFA_REQUIRED`. The TOTP secret is sealed with AES-256-GCM.
* CSRF: every state-changing request must carry `X-Requested-By: iskcon-web`; cross-site pages cannot add a
  custom header without a CORS preflight, which is refused.
* Authorisation is secure by default: `AccessGuard` refuses a route that declares neither `@Public()`,
  `@Authenticated()` nor `@RequirePermission(...)`. A test walks every route to prove it.
* Object-level rules (a candidate sees only their own file; a mentor only assigned candidates) live in
  `candidates` and are reached through `ApplicationAccess`.
* Uploads: type allow-list, size cap, content sniffing, stored under a random key in a private bucket,
  streamed through the API after a permission check. Never a public URL (NFR-7).
* Helmet headers, request ids on every log line and error, cookies and authorisation headers redacted from logs.

## 8. Errors

Every error is an RFC 9457 `application/problem+json` body (`packages/contracts/src/errors.ts`) with a stable
`code` the web app translates, optional `params`, field `errors`, and the `requestId`. Internal errors never
leak details. Business refusals are 422 with a specific code (`APPROVAL_BLOCKED`, `INVALID_STAGE_TRANSITION`,
`RULE_BELOW_FLOOR`); missing permission is 403; a missing or foreign record is 404.

## 9. Internationalisation

The API never sends English sentences for domain results. The rules engine returns message codes with
parameters (`rule.R-1.detail.notMet`, `{ since, months, dueOn }`) and the web app translates them. Languages:
English, Bengali, Hindi (translation files in `apps/web/messages/`; Bengali and Hindi wording is a draft for
the temple to review before use).

## 10. Testing

| Level | Where | What |
| --- | --- | --- |
| Pure unit | `packages/rules-engine/test` | every rule, boundary dates, floor validation, next step |
| Contract | `packages/contracts/test` | schema edge cases |
| Integration | `apps/api/test/*.int.spec.ts` | HTTP → controller → service → real PostgreSQL, one throwaway tenant per test |
| Boundary | `scripts/check-module-boundaries.mjs` | the four architecture rules |
| End to end | `apps/web/e2e` | Playwright against the real API and database |

Each integration test creates its own tenant, so tests never share rows and need no clean-up, and the
suite doubles as a tenant-isolation check. The clock is injected (`Clock`) so time-based rules and expiries are tested exactly.

## 11. Operations

Docker images for `api` and `web`; `docker-compose.yml` for local PostgreSQL and MinIO; configuration only
through environment variables validated at start-up (`apps/api/src/config/env.ts`); `/healthz` and `/readyz`;
JSON logs with request ids; graceful shutdown; migrations run by a one-off command or on boot behind a flag.
See `docs/operations.md`.

## 12. Roadmap to SaaS (not built)

The seams that make multi-temple a configuration change: `tenant_id` everywhere with composite foreign keys,
the `TenantResolver` port (swap the single-tenant resolver for a host-name one), per-tenant settings in the
`tenants` row, and tests that already run with many tenants. What the SaaS build adds: tenant sign-up and
billing, PostgreSQL row-level security as a second line of defence behind the repository filters,
per-tenant branding and domains, a super-admin console, per-tenant rate limits and storage quotas, and a
decision on whether any module is extracted into a service (ADR-0001 lists the criteria).
