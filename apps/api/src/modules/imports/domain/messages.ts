/**
 * What a row's checks say. A code plus parameters, translated by the web app (docs: CODES.md).
 * Errors keep the row from being created; warnings are for the person reading the preview.
 */
export interface RowMessage {
  code: string;
  params?: Record<string, string | number>;
}

export const ROW_ERRORS = {
  nameRequired: 'import.name.required',
  emailInvalid: 'import.email.invalid',
  phoneInvalid: 'import.phone.invalid',
  dateInvalid: 'import.date.invalid',
  dateFuture: 'import.date.future',
  trackInvalid: 'import.track.invalid',
  tooLong: 'import.field.tooLong',
  fieldInvalid: 'import.field.invalid',
  mentorUnknown: 'import.mentor.unknown',
  mentorAmbiguous: 'import.mentor.ambiguous',
  guruUnknown: 'import.guru.unknown',
  guruInactive: 'import.guru.inactive',
} as const;

export const ROW_WARNINGS = {
  duplicateExisting: 'import.duplicate.existing',
  duplicateInFile: 'import.duplicate.inFile',
  noContact: 'import.contact.missing',
  formulaLike: 'import.cell.formulaLike',
  practiceNotApplied: 'import.practiceSince.notApplied',
} as const;

export const DUPLICATE_CODES: readonly string[] = [ROW_WARNINGS.duplicateExisting, ROW_WARNINGS.duplicateInFile];
