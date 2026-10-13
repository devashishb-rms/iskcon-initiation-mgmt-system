# ADR-0001: Modular monolith

**Status:** accepted

**Context.** One temple, a small team, a workflow with strong consistency needs (a stage change, its audit line and
its notification must succeed or fail together). A later multi-temple product must reuse the code.

**Decision.** One deployable NestJS application split into modules (`identity`, `gurus`, `candidates`, `rules`,
`checklist`, `documents`, `recommendations`, `ceremonies`, `register`, `notifications`, `imports`, `audit`, `views`).
A module exposes only its `index.ts`; `scripts/check-module-boundaries.mjs` fails CI on deep imports, upward
imports and cycles. Cross-module needs go through ports (`shared/`), facets (`platform/facets`) or domain events.

**Consequences.** One transaction per request, simple operations, no network failure modes between modules. A module
can later be extracted into a service because its only coupling is a port or an event. The price is discipline,
which the boundary check turns into a build failure instead of a review comment.
