# HTTP API

Base path `/` on the API (the web app proxies `/api/*` to it). JSON in and out. Schemas are in
`packages/contracts/src`. Errors are `application/problem+json` (`Problem` in contracts/errors.ts).
Every state-changing request needs the header `X-Requested-By: iskcon-web` and the session cookie `sid`.
A route's required permission is in the last column (`ROLE_PERMISSIONS` in contracts/permissions.ts maps roles
to permissions). "own/assigned" means the caller is checked against the specific application as well.

## Auth and people

| Method and path | Body / query → response | Access |
| --- | --- | --- |
| POST `/auth/otp/request` | `requestOtpBody` → 202 `{accepted:true}` (never says whether the account exists) | public |
| POST `/auth/otp/verify` | `verifyOtpBody` → `SessionResponse`, sets cookie | public |
| GET `/auth/session` | → `SessionResponse` | signed in |
| POST `/auth/logout` | → 204 | signed in |
| POST `/auth/mfa/enrol` | → `{secret, otpauthUrl}` | signed in |
| POST `/auth/mfa/enrol/confirm` | `{code}` → `SessionResponse` | signed in |
| POST `/auth/mfa/verify` | `{code}` → `SessionResponse` | signed in |
| GET `/people` | → `PersonDto[]` | `people:manage` |
| POST `/people` | `createPersonBody` → `PersonDto` | `people:manage` |
| PATCH `/people/:id` | `updatePersonBody` → `PersonDto` | `people:manage` |
| GET `/mentors` | → `MentorOption[]` | signed in |
| GET `/gurus` | → `GuruDto[]` | signed in |
| POST `/gurus` | `createGuruBody` → `GuruDto` | `people:manage` |
| PATCH `/gurus/:id` | `updateGuruBody` → `GuruDto` | `people:manage` |

## Candidates and applications

| Method and path | Body / query → response | Access |
| --- | --- | --- |
| GET `/candidates` | `candidateListQuery` → `Page<CandidateListItem>` (mentor: only assigned; candidate: only own) | read:any / assigned / own |
| POST `/candidates` | `createCandidateBody` → `{candidateId, applicationId}` (records consent; optionally creates a login) | `candidate:create` |
| GET `/candidates/export.csv`, `/candidates/export.pdf` | same query as list → file | `candidate:export` |
| POST `/candidates/:candidateId/applications` | `createSecondApplicationBody` → `{applicationId}` (second initiation, candidate must be INITIATED) | `candidate:create` |
| GET `/me/path` | → `ApplicationDetail` of the caller's current application (404 if none) | candidate |
| GET `/applications/:id` | → `ApplicationDetail` | own/assigned/any |
| GET `/applications/:id/timeline` | → `TimelineEvent[]` | own/assigned/any |
| PATCH `/applications/:id/facts` | `updateFactsBody` → `ApplicationDetail` (each field has its own permission: practiceSince = `application:set-practice`; the rest `application:set-temple-facts`) | per field |
| PATCH `/applications/:id/guru` | `changeGuruBody` → `ApplicationDetail` | `application:change-guru` |
| POST `/applications/:id/advance` | `advanceBody` (ASPIRING→SHELTER→PREPARING) → `ApplicationDetail` | `application:advance` |
| POST `/applications/:id/submit` | `submitApplicationBody` (readiness note; PREPARING→APPLIED) → `ApplicationDetail` | `application:submit`, assigned |
| GET `/applications/:id/notes` | → `NoteDto[]` | own/assigned/any |
| POST `/applications/:id/notes` | `createNoteBody` → `NoteDto` (MONTHLY needs `note:monthly`) | `note:message` or `note:monthly` |
| GET `/review-queue` | `pageQuery` → `Page<ReviewQueueItem>` (APPLIED, oldest first) | `recommendation:decide` |

## Documents, exceptions, decisions, hand-off

| Method and path | Body / query → response | Access |
| --- | --- | --- |
| GET `/applications/:id/documents` | → `DocumentDto[]` | `document:read` + visible |
| POST `/applications/:id/documents` | multipart: `file`, field `type` (DocumentType) → `DocumentDto` | `document:upload` + visible |
| GET `/documents/:id/content` | → file stream, `Content-Disposition: inline` | `document:read` + visible |
| DELETE `/documents/:id` | → 204 (soft delete, audited; only the uploader or an administrator) | `document:upload` |
| POST `/applications/:id/exceptions` | `recordExceptionBody` → `ExceptionDto` | `exception:record` |
| DELETE `/applications/:id/exceptions/:ruleId` | → 204 | `exception:record` |
| POST `/applications/:id/recommendation` | `decideBody` → `ApplicationDetail`; APPROVE needs a clean checklist or exceptions, else 422 `APPROVAL_BLOCKED` | `recommendation:decide` |
| GET `/applications/:id/recommendation/letter` | → PDF | `recommendation:letter` (after approval) |
| GET `/applications/:id/package/preview` | → `PackagePreview` | `package:export` |
| POST `/applications/:id/package` | → zip (cover PDF + documents); logs what was missing | `package:export` |
| POST `/applications/:id/guru-response` | `recordGuruResponseBody` → `ApplicationDetail` (ACCEPTED keeps RECOMMENDED; WAIT returns to PREPARING; DECLINED closes) | `guru-response:record` |

## Rule sets

| Method and path | Body / query → response | Access |
| --- | --- | --- |
| GET `/rule-sets` | → `RuleSetDto[]` (baseline first) | `ruleset:read` |
| GET `/rule-sets/floor` | → `{ floor: RuleParamsDto, baseline: RuleParamsDto }` | `ruleset:read` |
| POST `/rule-sets` | `createRuleSetBody` → `RuleSetDto` (a draft copied from the baseline) | `ruleset:edit` |
| PUT `/rule-sets/:id/draft` | `saveDraftBody` → `RuleSetDto`; below the floor → 422 `RULE_BELOW_FLOOR` with `errors` | `ruleset:edit` |
| POST `/rule-sets/:id/publish` | → `RuleSetDto` (new version; older versions keep their recommendations) | `ruleset:edit` |
| DELETE `/rule-sets/:id/draft` | → 204 | `ruleset:edit` |

## Ceremonies and register

| Method and path | Body / query → response | Access |
| --- | --- | --- |
| GET `/ceremonies` | → `CeremonyDto[]` (soonest first) | `ceremony:read` |
| POST `/ceremonies` | `createCeremonyBody` → `CeremonyDto` | `ceremony:manage` |
| GET `/ceremonies/:id` | → `CeremonyDto` | `ceremony:read` |
| GET `/ceremonies/:id/eligible` | → eligible attendees (guru accepted, same guru and track, not attached elsewhere) | `ceremony:manage` |
| POST `/ceremonies/:id/attendees` | `attachAttendeeBody` → `CeremonyDto` | `ceremony:manage` |
| DELETE `/ceremonies/:id/attendees/:applicationId` | → `CeremonyDto` | `ceremony:manage` |
| PATCH `/ceremonies/:id/attendees/:applicationId` | `markAttendanceBody` → `CeremonyDto` | `ceremony:manage` |
| POST `/ceremonies/:id/complete` | `completeCeremonyBody` → `CeremonyDto`; writes one register entry per present attendee, atomically | `ceremony:manage` |
| POST `/ceremonies/:id/cancel` | → `CeremonyDto` | `ceremony:manage` |
| GET `/register` | `registerQuery` → `Page<RegisterEntryDto>` | `register:read` |
| GET `/register/export.csv`, `/register/export.pdf` | same filters → file | `register:export` |
| PATCH `/register/:id` | `correctRegisterBody` → `RegisterEntryDto` (audited with the reason) | `register:correct` |

## Notifications, import, audit

| Method and path | Body / query → response | Access |
| --- | --- | --- |
| GET `/notifications` | `pageQuery` → `Page<NotificationDto>` and header `X-Unread-Count` | `notification:read` |
| POST `/notifications/:id/read`, `/notifications/read-all` | → 204 | `notification:read` |
| GET `/imports/template.csv` | → CSV with the expected headings | `import:run` |
| POST `/imports` | multipart `file` (.csv or .xlsx) → `ImportPreview` (nothing saved yet) | `import:run` |
| POST `/imports/:id/commit` | → `{created, skipped}` | `import:run` |
| GET `/audit` | `auditQuery` → `Page<AuditEntryDto>` | `audit:read` |
| GET `/healthz`, `/readyz` | → `{status:'ok'}` | public |
