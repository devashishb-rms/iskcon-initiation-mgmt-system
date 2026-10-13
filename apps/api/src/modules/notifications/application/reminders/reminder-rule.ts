import type { NotificationIntent } from '../../domain/draft';

export interface ReminderContext {
  /** Today's date (YYYY-MM-DD) in the temple's time zone. */
  today: string;
  now: Date;
}

/**
 * One kind of reminder. A rule only decides who needs reminding of what today; the job around it
 * handles tenants, locking, the transaction and writing. A new reminder is a new class in
 * REMINDER_RULES. Intents must carry a dedupe key that is stable for the day (`reminderDedupeKey`),
 * which is what makes running the job twice harmless.
 */
export interface ReminderRule {
  /** Stable name; part of the advisory-lock name and of the dedupe keys. */
  readonly name: string;
  collect(context: ReminderContext): Promise<NotificationIntent[]>;
}

export const REMINDER_RULES = Symbol('REMINDER_RULES');
