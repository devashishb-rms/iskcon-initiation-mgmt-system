# ADR-0004: Transactional outbox, ports and facets

**Status:** accepted

**Context.** Modules need to react to each other (notify the mentor when a file is recommended) and to contribute to
a shared screen (the application file shows documents, exceptions, the decision, the guru's answer) without
importing each other, because that creates cycles.

**Decision.**
* **Outbox.** A domain event is written to an outbox table in the same transaction as the change. A dispatcher
  delivers it to `@OnDomainEvent` handlers with retry. Handlers are idempotent. The event stamps the actor.
* **Ports.** `ApplicationAccess` ("may this caller see X") and `ApplicationWorkflow` ("move X forward") are abstract
  classes in `shared/`, implemented by `candidates`.
* **Facets.** `@ApplicationFacetProvider()` lets a module contribute evidence, detail parts, timeline entries and
  actions to the application file. `views` composes them.

**Consequences.** A new module extends the application file by adding a provider, not by editing `checklist` or
`views`. Notifications can fail and retry without ever rolling back the business change. Event handlers run after
commit, so a screen read immediately after a write may precede its notification by up to the poll interval.
