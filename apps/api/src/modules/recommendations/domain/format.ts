/** A calendar date for people to read ("14 October 2026") in the temple's own time zone. */
export function longDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'long', year: 'numeric' }).format(instant);
}
