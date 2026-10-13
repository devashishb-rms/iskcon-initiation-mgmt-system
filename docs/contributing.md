# Building a module

How a module is written here, with `candidates`, `rules`, `identity` and `audit` as the worked
examples. Read `docs/architecture.md` first for the why. The rules below are checked by
`pnpm check:boundaries` (CI fails otherwise).

## Layout

```
modules/<name>/
  domain/          pure TypeScript: rules and value objects. No Nest, no database, no HTTP.
  application/     services (use cases), one responsibility each; event handlers; facets
  infrastructure/  repositories (Drizzle) and adapters. The only place that touches tables.
  http/            controllers: parse, authorise, call ONE service inside the unit of work, return
  <name>.module.ts wiring
  index.ts         the module's public surface. Other modules import ONLY from here.
```

## Rules

1. A module reads and writes only its own tables (see the ownership map in
   `scripts/check-module-boundaries.mjs`). To use another module's data, call its exported service.
2. Another module is imported only through its `index.ts`. Nothing in `platform/`, `shared/` or
   `common/` imports a module.
3. Controllers do not import repositories or infrastructure. Domain code imports nothing from Nest,
   Drizzle or outer layers.
4. Every route declares its access: `@Public()`, `@Authenticated()` (the service then does the
   object-level check) or `@RequirePermission(...)`. A route with none is refused (secure by default).
5. Bodies and queries are parsed with `@Body(zod(schema))` / `@Query(zod(schema))` using the schema from
   `@iskcon/contracts`. **Contracts are frozen for you**: if you need a change, write the request in
   your hand-off notes instead of editing `packages/contracts`.
6. Every handler runs inside `this.uow.run(() => service.method(...))`. Repositories use
   `DbService.client`, which is the active transaction. Never open your own transaction. (One deliberate
   exception: `POST /imports/:id/commit` creates each person in a transaction of their own, so one bad row
   cannot undo the good ones.)
7. Every query filters by `tenantId` (`this.ctx.tenantId`). Every insert sets it. Foreign keys are
   composite `(tenant_id, id)`.
8. Changes write an audit line (`AuditService.record`) in the same transaction. Decisions that other
   modules care about publish a domain event (`EventBus.publish(EVENTS.x, payload)`); subscribers use
   `@OnDomainEvent(EVENTS.x)` and must be idempotent (delivery is at least once).
9. Errors are thrown as the classes in `common/errors.ts` with a stable code from the contracts
   (`ERROR_CODES`). Messages are for developers; the web app translates the code.
10. No time zones or `new Date()` in business code: use `Clock` (`clock.now()`, `clock.today()`).
11. Human text sent to people (mail, SMS, notifications) is a message code plus parameters; the
    templates per language live in one place per module.
12. Who may see which application is decided by `candidates` through the `ApplicationAccess` port
    (`assertCanRead`, `assertCanContribute`). Moving or closing an application goes through the
    `ApplicationWorkflow` port. Never update `applications` yourself.

## Contributing to the application file (facets)

A module adds to the checklist inputs, the detail screen, the timeline and the actions offered by
writing a provider decorated with `@ApplicationFacetProvider()` that implements part of
`ApplicationFacet` (`platform/facets/facets.ts`). The composer asks every facet; nothing imports your
module. See `candidates/application/candidates.facet.ts`.

## Tests

* Integration tests (`test/*.int.spec.ts`) boot the whole app against a real Postgres, create a fresh
  tenant per test (`w.newTenant()`) and call the API with `supertest` clients (`w.signIn`). Look at
  `test/candidates.int.spec.ts`. No mocks of the database.
* Cover: the happy path, each refusal (wrong role, wrong state, someone else's file), tenant
  isolation, and that the audit line / event was written.
* Domain logic with branches gets plain unit tests next to it (`*.spec.ts`).

## Commands

```
pnpm install                       # run through `flock /tmp/pnpm.lock` if several people work at once
pnpm -F @iskcon/api typecheck
pnpm -F @iskcon/api test           # needs Postgres: TEST_DATABASE_URL (default localhost:5433/iskcon_test)
pnpm check:boundaries
pnpm -F @iskcon/api seed           # sample data (DATABASE_URL, APP_ENCRYPTION_KEY required)
```
