import type { NotificationKind, NotificationMessage } from './notification-kinds';
import type { Recipient } from './recipient';

/** What a planner decides: who is told what. It knows nothing about channels, dedupe or storage. */
export interface DraftNotification {
  recipient: Recipient;
  kind: NotificationKind;
  message: NotificationMessage;
  /** Where the web app should take the person (a route, never a full URL). */
  link: string | null;
  /**
   * What the notification is about (an application id). Lets one person receive several
   * notifications from one event (a mentor whose three candidates were initiated together).
   */
  scope?: string;
}

/** A draft with the key that makes it safe to create twice. */
export interface NotificationIntent extends DraftNotification {
  /** Unique per (tenant, dedupeKey, channel). Redelivered events and re-run jobs produce the same key. */
  dedupeKey: string;
}
