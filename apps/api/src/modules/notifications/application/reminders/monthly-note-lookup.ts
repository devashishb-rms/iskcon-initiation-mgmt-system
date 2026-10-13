/**
 * When did a mentor last write a MONTHLY note on each application? A port, so the notifications
 * module does not depend on how the candidates module stores notes. Called inside `ScopedAsUser`
 * for the mentor, so the answer covers only files that mentor may see.
 */
export abstract class MonthlyNoteLookup {
  /** Applications without a monthly note are absent from the map. */
  abstract lastMonthlyNoteAt(applicationIds: string[]): Promise<Map<string, Date>>;
}
