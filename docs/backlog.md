# Backlog and known gaps

Things the backend deliberately does not do yet, collected from the module builders' notes. None blocks the
single-temple release; each is small and independent.

## Cross-module

* **Guru acceptance should lock the application.** `ApplicationWorkflow` needs `lock(applicationId)` so recording
  ACCEPTED can freeze the file against late edits.
* **Mentor reminders.** `candidates` should expose `lastMonthlyNoteAt(ids)` and a system-level
  `listOpenInStages(...)` so the reminder job can stop using its own query.
* **Import duplicate detection.** `candidates` should expose `contactsInUse()` so the import preview can flag people
  who already exist; today only duplicates inside the file are flagged.
* **Audited `practiceSince` on import.** Imported practice dates should go through the audited fact-setting path.
* **Notification retry schedule.** Add a `next_attempt_at` column so retries back off instead of running every poll.
* **Import welcome message.** Importing a person creates a welcome notification; make it optional.

## Content that needs the temple's wording

* The recommendation letter and cover sheet are English only. Bengali and Hindi text must be written or reviewed by
  the temple before it is put on a letter that carries the president's name.

## Security and operations

* **Malware scanning.** `VirusScanner` is a no-op port. Plug in ClamAV (clamd over TCP) when hosting allows; the
  call site and the "reject on infection" path already exist.
* **Rate limits.** One-time-code requests are limited per account and per hour; add per-IP limits at the proxy.
* **Observability.** Metrics endpoint and tracing are not wired; logs and health checks are.

## Multi-tenant product (next build)

See ADR-0003. Needs: a hostname or path `TenantResolver`, per-tenant settings and branding, per-tenant encryption
keys, row-level security as a second guard, tenant-scoped storage prefixes (already in the key layout), and
a platform-admin surface for creating temples.
