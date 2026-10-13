# Notification message codes

The web app renders IN_APP notifications from `message.code` and `message.params`; the server renders
EMAIL and SMS from the same codes (`domain/templates/{en,bn,hi}.ts`, English when the recipient's
`users.locale` has no template). **Codes are API: never rename or reuse one.** Add a new code (and a
template in all three languages; a unit test fails if one is missing) instead.

Parameters are plain strings or numbers. They never carry document contents or free text beyond what is
listed. Every string is sanitised again before it enters an e-mail or SMS (no markup, no line breaks).
`link` is a web route (the server adds `PUBLIC_WEB_URL` for e-mail).

| Code | Kind | Told | Params | Channels | Link |
| --- | --- | --- | --- | --- | --- |
| `notification.welcome` | WELCOME | the new candidate (if they have a login) | none | in-app, e-mail, SMS | `/path` |
| `notification.mentorAssigned` | MENTOR_ASSIGNED | the assigned mentor | `candidateName` | in-app, e-mail | `/applications/:id` |
| `notification.fileWaiting` | APPLICATION_SUBMITTED | every active president | `candidateName` | in-app, e-mail | `/queue` |
| `notification.sentBack.staff` | SENT_BACK | the mentor | `candidateName`, `reason` | in-app, e-mail, SMS (SMS without the reason) | `/applications/:id` |
| `notification.sentBack.self` | SENT_BACK | the candidate | `reason` | in-app, e-mail, SMS (SMS without the reason) | `/path` |
| `notification.approved.staff` | APPROVED | committee members, the mentor | `candidateName` | in-app, e-mail, SMS | `/applications/:id` |
| `notification.approved.self` | APPROVED | the candidate | none | in-app, e-mail, SMS | `/path` |
| `notification.declined.staff` | DECLINED | the mentor, committee members | `candidateName`, `by` (`PRESIDENT` or `GURU`), `reason` | in-app, e-mail, SMS (SMS without the reason) | `/applications/:id` |
| `notification.declined.self` | DECLINED | the candidate | `by` (no reason: the mentor explains it) | in-app, e-mail, SMS | `/path` |
| `notification.guruResponse.staff` | GURU_RESPONSE | committee members, the mentor | `candidateName`, `response` (`ACCEPTED`, `WAIT`, `DECLINED`) | in-app, e-mail, SMS | `/applications/:id` |
| `notification.guruResponse.self` | GURU_RESPONSE | the candidate | `response` | in-app, e-mail, SMS | `/path` |
| `notification.documentUploaded` | DOCUMENT_UPLOADED | the assigned mentor | `candidateName`, `documentType` (the document type enum, not a file name) | in-app, e-mail | `/applications/:id` |
| `notification.ceremonyCompleted.staff` | CEREMONY_COMPLETED | the mentor, once per initiated candidate | `candidateName`, `date` (YYYY-MM-DD) | in-app, e-mail | `/applications/:id` |
| `notification.ceremonyCompleted.self` | CEREMONY_COMPLETED | each initiated candidate with a login | `date` | in-app, e-mail | `/path` |
| `notification.monthlyNoteDue` | MONTHLY_NOTE_DUE | a mentor (daily reminder) | `count`, `names` (up to three, comma separated) | in-app, e-mail | `/candidates` |
| `notification.filesWaiting` | FILES_WAITING | each president (daily digest) | `count`, `oldestDays` | in-app, e-mail | `/queue` |

Who is never told: the person who caused the event (when the publisher puts `actorId` in the payload,
see REQUESTS.md), anyone with `users.active = false`, and, for reasons, anyone who may not read the
file (the candidate gets no decline reason).

## Rules behind the table

* **Channels.** A kind lists the channels it may use (`domain/channel-policy.ts`); a person gets the ones
  they can be reached on: EMAIL needs an e-mail address, SMS needs a phone number and a configured SMS
  gateway, IN_APP always. IN_APP rows are created as `SENT` (the inbox is the delivery); EMAIL and SMS rows
  start `PENDING` and are sent by the delivery worker.
* **Dedupe keys** (unique per tenant, key and channel).
  * Event driven: `event:<event type>:<outbox event id>:<kind>:<application or document id>:<user id>`.
    A redelivered event creates nothing; a new event of the same type does.
  * Reminders: `reminder:<rule>:<user id>:<YYYY-MM-DD in the temple's time zone>`, so each person gets at
    most one monthly-note reminder and one digest per day, however often the job runs.
* **Retry.** A failing send is retried after 1, 4, 16 and 64 minutes and is `FAILED` after the fifth
  failure. A missing recipient, address or channel fails at once without retries. The next try time is
  kept in `payload.retry.at` (see REQUESTS.md).
* **Reminders** run daily at 09:00 Asia/Kolkata (`SCHEDULER_ENABLED`), for each tenant and rule under a
  Postgres advisory lock. Monthly note: open applications in SHELTER or PREPARING of the mentor with no
  MONTHLY note in the last 35 days. Digest: open applications in APPLIED for more than 7 days.
