import type { DraftNotification } from './draft';

/** The business event a notification came from: its type and id (the outbox id, unique and stable). */
export interface EventRef {
  type: string;
  id: number;
}

/** Same event + same person + same subject = same key, however often the event is delivered. */
export const eventDedupeKey = (event: EventRef, draft: Pick<DraftNotification, 'kind' | 'scope' | 'recipient'>): string =>
  `event:${event.type}:${event.id}:${draft.kind}:${draft.scope ?? '-'}:${draft.recipient.id}`;

/** A reminder is created at most once per person per day. `day` is YYYY-MM-DD in the temple's time zone. */
export const reminderDedupeKey = (rule: string, recipientId: string, day: string): string => `reminder:${rule}:${recipientId}:${day}`;

/**
 * One notification per person and subject per event. When a person holds two roles (a mentor who is
 * also on the committee) the first draft wins, so planners list the most specific audience first.
 */
export function uniqueByRecipient<T extends Pick<DraftNotification, 'recipient' | 'scope'>>(drafts: T[]): T[] {
  const seen = new Set<string>();
  return drafts.filter((d) => {
    const key = `${d.recipient.id}|${d.scope ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Who caused an event, when the publisher says so (`actorId` in the payload). People are never told
 * about their own action.
 */
export const actorOf = (payload: Record<string, unknown>): string | undefined =>
  typeof payload.actorId === 'string' && payload.actorId ? payload.actorId : undefined;
