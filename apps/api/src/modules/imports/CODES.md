# Import message codes

Row messages in the preview (`results[].messages`) and in the commit's `skippedRows`. The web app
translates the code and fills in `params`. Codes are stable.

| Code | Level | Params | Meaning |
| --- | --- | --- | --- |
| `import.name.required` | error | | no name |
| `import.email.invalid` | error | | not an e-mail address |
| `import.phone.invalid` | error | | not a phone number (8 to 15 digits; a bare 10-digit number is an Indian mobile) |
| `import.date.invalid` | error | `field` | not a real date (accepted: YYYY-MM-DD and day-first D/M/YYYY, D-M-YYYY, D.M.YYYY) |
| `import.date.future` | error | `field` | date after today |
| `import.track.invalid` | error | | not FIRST or SECOND (case does not matter) |
| `import.field.tooLong` | error | `field`, `max` | longer than allowed |
| `import.field.invalid` | error | `field` | rejected by the contract's rules |
| `import.mentor.unknown` | error | `value` | no active mentor with that e-mail or exact name |
| `import.mentor.ambiguous` | error | `value` | several mentors share that name; use the e-mail |
| `import.guru.unknown` | error | `value` | no guru with that exact name |
| `import.guru.inactive` | error | `value` | the guru is no longer active |
| `import.duplicate.existing` | warning, row skipped | `field` (`email` or `phone`) | someone with these contact details exists |
| `import.duplicate.inFile` | warning, row skipped | `field` (`phone`, `email`, `name`), `line` | repeats an earlier row |
| `import.contact.missing` | warning | | no phone or e-mail: no login, and a repeat cannot be recognised |
| `import.cell.formulaLike` | warning | `field` | a cell starting with `=` or `@`; kept as plain text |
| `import.practiceSince.notApplied` | warning | | the practice start date is confirmed by the mentor and is not set by an import |
| `import.row.failed` | commit only | `reason` (an error code such as `NOT_A_MENTOR`, `DATE_IN_FUTURE`) | the row passed the preview but the candidate service refused it at commit |

Row `status`: `ERROR` when any error code is present, `WARNING` when only warnings are, else `OK`.
`ERROR` and duplicate rows are not created. At commit `created + skipped` equals the number of rows.

File-level refusals (HTTP `errors[].code` with `path: "file"`): `FILE_REQUIRED`, `MISSING_COLUMN`
(`column`), `NO_ROWS`, `TOO_MANY_ROWS` (`max`). Status codes: 413 `FILE_TOO_LARGE` (over 5 MB), 415
`FILE_TYPE_NOT_ALLOWED` (not a UTF-8 CSV or readable xlsx, or another extension), 409 `CONFLICT` with
`params.reason` `ALREADY_COMMITTED` or `EXPIRED`, 400 `CONSENT_REQUIRED` on the commit body.
