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
| GET `/documents/:id/content` | → file stream, `Content-Disposition: inline` (preview) | `document:read` + visible |
| GET `/documents/:id/file` | → same file, `Content-Disposition: attachment` (download) | `document:read` + visible |
| DELETE `/documents/:id` | → 204 (soft delete, audited; only the uploader or an administrator) | `document:upload` |
| POST `/applications/:id/exceptions` | `recordExceptionBody` → `ExceptionDto` | `exception:record` |
| DELETE `/applications/:id/exceptions/:ruleId` | → 204 | `exception:record` |
| POST `/applications/:id/recommendation` | `decideBody` → receipt `{applicationId, recommendationId, decision, stage, status}` (re-read the application); APPROVE needs a clean checklist or exceptions, else 422 `APPROVAL_BLOCKED` | `recommendation:decide` |
| GET `/applications/:id/recommendation/letter` | → PDF | `recommendation:letter` (after approval) |
| GET `/applications/:id/package/preview` | → `PackagePreview` | `package:export` |
| POST `/applications/:id/package` | → zip (cover PDF + documents); logs what was missing | `package:export` |
| POST `/applications/:id/guru-response` | `recordGuruResponseBody` → receipt `{applicationId, responseId, response, stage, status}` (ACCEPTED keeps RECOMMENDED; WAIT returns to PREPARING; DECLINED closes) | `guru-response:record` |

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

## Behaviours and codes the web app must handle

Status codes: 201 for creations and for `POST /imports` and `/imports/:id/commit`; 204 for deletes and
mark-as-read; 200 for the package zip. A wrong stage or a closed application is **409 `CONFLICT`** with
`params.stage` or `params.status`; a refused transition inside the stage machine is **422
`INVALID_STAGE_TRANSITION`**. Uploads: **413 `FILE_TOO_LARGE`**, **415 `FILE_TYPE_NOT_ALLOWED`** (decided by the
file's first bytes, not its name), 400 `FILE_REQUIRED`. Imports: 400 `TOO_MANY_ROWS`, 409 `ALREADY_COMMITTED`,
409 `EXPIRED`, 400 `CONSENT_REQUIRED`. Notifications: `GET /notifications` sets `X-Unread-Count` (exposed to
browsers by CORS); another person's notification id is a 404.

`APPROVAL_BLOCKED` carries `params.blockers` (comma-separated rule ids, for example `"R-2,R-4"`) or
`params.reason: "GURU_REQUIRED"`. Exceptions: R-5 cannot be excepted (400 field error `RULE_NOT_EXCEPTABLE`);
recording the same exception again replaces its reason. A ceremony cannot complete with nobody present
(`NOBODY_PRESENT`); a register correction that changes nothing is 422 `UNCHANGED`. Exports are capped at 20,000
rows.

Field-error codes (`errors[].code`, translate each): `SPIRITUAL_NAME_REQUIRED`, `NOBODY_PRESENT`,
`DATE_IN_FUTURE`, `ATTENDEE_NOT_RECOMMENDED`, `UNCHANGED`, `DATE_RANGE_INVALID`, `REASON_REQUIRED`,
`RULE_NOT_EXCEPTABLE`, `SHELTER_DATE_REQUIRED`, `GURU_REQUIRED`, `NOT_A_MENTOR`, `CONSENT_REQUIRED`,
`FILE_REQUIRED`, `PHONE_INVALID`. Ceremony eligibility reasons: `NOT_OPEN`, `STAGE_NOT_RECOMMENDED`,
`TRACK_MISMATCH`, `GURU_MISMATCH`, `GURU_NOT_ACCEPTED`, `ALREADY_ATTACHED`.

Timeline summary codes: `timeline.stage` (`from`, `to`, optional `reason`), `timeline.facts` (`fields`),
`timeline.note.monthly|readiness|message|send_back`, `timeline.document.uploaded` (`type`, `filename`),
`timeline.document.removed` (`type`), `timeline.exception.recorded` (`ruleId`, `reason`),
`timeline.exception.removed` (`ruleId`), `timeline.recommendation.approve|send_back|decline` (`reason`),
`timeline.guruResponse.accepted|wait|declined` (`reason`), `timeline.package.exported` (`missing`, staff only),
`timeline.register` (`date`, `spiritualName`). Notification message codes are listed in
`apps/api/src/modules/notifications/CODES.md` and exported as `MESSAGE_CODES` from `@iskcon/contracts`; import
row messages are in `apps/api/src/modules/imports/CODES.md`. Checklist labels, details and next steps are the
codes in `packages/rules-engine/src`.

Notes on individual routes: `GET /ceremonies/:id/eligible` returns `[{applicationId, candidateName}]`.
`PATCH /ceremonies/:id/attendees/:applicationId` accepts an optional `spiritualName` besides `present`.
`GET /register` and the exports accept `from` and `to` (inclusive initiation dates). `DELETE /documents/:id` is a
soft delete: 403 unless the caller is the uploader or an administrator, 409 once the file is at RECOMMENDED or later.
`POST /imports/:id/commit` takes `{consent: {accepted: true, version}}` and answers `{created, skipped, skippedRows}`.
