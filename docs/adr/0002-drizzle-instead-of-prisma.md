# ADR-0002: Drizzle ORM and plain SQL migrations instead of Prisma

**Status:** accepted (supersedes the original plan in the early docs)

**Context.** The first design used Prisma. Prisma downloads native query-engine binaries at install time; in the
locked-down build environment (and in some customers' CI) that download is blocked, so install and generate fail.
The system also needs composite foreign keys that include `tenant_id`, partial unique indexes and `FOR UPDATE SKIP
LOCKED`, which are first-class in SQL and awkward through an engine-based client.

**Decision.** Drizzle ORM with `pg`, schema in TypeScript (`src/database/schema`), migrations generated to plain SQL
files in `apps/api/drizzle/` and applied by `src/database/migrate.ts`.

**Consequences.** No binary downloads; the SQL that runs in production is the SQL that was reviewed. Types come from
the schema. The team must read SQL in migration diffs. Repositories are the only code that imports Drizzle, so
swapping the data layer later touches `infrastructure/` folders only.
