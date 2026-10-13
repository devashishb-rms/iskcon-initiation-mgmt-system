# ADR-0003: Tenant-aware from day one, one tenant active

**Status:** accepted

**Context.** The next product hosts many temples in one deployment. Retrofitting tenancy into a finished schema is
the expensive part of that move.

**Decision.** Every table has `tenant_id`; every foreign key between tenant tables is composite
(`tenant_id`, id) so a row can never point at another temple's row; every query goes through repositories that read
the tenant from `RequestContextService`. A `TenantResolver` port decides the tenant for a request. Today it is
`SingleTenantResolver` (`DEFAULT_TENANT_SLUG`). Timestamps and "today" come from a `Clock` in the temple's time zone.

**Consequences.** The single-temple build carries one extra column and a resolver that always answers the same
thing. Becoming multi-tenant means a hostname/path resolver, per-tenant settings and keys, optional row-level
security as a second guard, and a platform-admin surface; none of the modules change. See `docs/backlog.md`.
