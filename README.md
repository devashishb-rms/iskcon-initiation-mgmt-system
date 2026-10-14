# ISKCON Initiation Management System

Software System to Management the Initiation (Diksha) process workflow of Iskcon Newtown (Kolkata) temple

A web application that takes a devotee from first enquiry through shelter, preparation, the mentor's readiness note,
the president's recommendation, the guru's acceptance and the initiation ceremony to the initiation register,
checking each step against the temple's and the GBC's rules.

* **Who uses it:** candidates, mentors, the president, the office (administrators), gurus' secretaries.
* **Languages:** English, Bengali, Hindi.
* **Sign-in:** one-time code by email or SMS; authenticator-app second factor for the president and administrators.

## Repository layout

```
apps/api            NestJS API (modular monolith), PostgreSQL via Drizzle
apps/web            Next.js web app
packages/contracts  Request/response schemas and permissions shared by API and web (zod)
packages/rules-engine  The eligibility rules as pure TypeScript, no framework
docs/               Architecture, API, operations, ADRs, contributing, backlog
```

## Quick start

```bash
cp .env.example .env     # set APP_ENCRYPTION_KEY (openssl rand -base64 32)
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev
pnpm test                # integration tests need Postgres (see docs/contributing.md)
```

## Documentation

* [Architecture](docs/architecture.md): modules, dependency rules, data, events
* [HTTP API](docs/api.md)
* [Operations](docs/operations.md): configuration, Docker, backups, go-live checklist
* [Deploy beside an existing server without Docker](deploy/aws-vm/README.md)
* [Contributing](docs/contributing.md): conventions and how to add a module or a rule
* [Decisions](docs/adr): why it is built this way
* [Backlog](docs/backlog.md): known gaps

## Principles

Modular monolith with boundaries enforced in CI; each module has one reason to change and talks to others through
small ports, domain events and facets. Everything is tenant-aware (one temple is active today) so the same code
can become a multi-temple product. Cloud-neutral: PostgreSQL and any S3-compatible store.
