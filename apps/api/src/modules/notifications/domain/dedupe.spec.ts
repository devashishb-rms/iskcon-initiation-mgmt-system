import { actorOf, eventDedupeKey, reminderDedupeKey, uniqueByRecipient } from './dedupe';
import type { Recipient } from './recipient';

const person = (id: string): Recipient => ({ id, name: id, email: null, phone: null, locale: 'en' });

describe('dedupe', () => {
  it('derives the same key for the same event, person and subject, and different keys otherwise', () => {
    const event = { type: 'application.approved', id: 7 };
    const draft = { kind: 'APPROVED' as const, recipient: person('u1'), scope: 'a1' };
    expect(eventDedupeKey(event, draft)).toBe(eventDedupeKey({ ...event }, { ...draft }));
    expect(eventDedupeKey(event, draft)).not.toBe(eventDedupeKey({ ...event, id: 8 }, draft));
    expect(eventDedupeKey(event, draft)).not.toBe(eventDedupeKey(event, { ...draft, recipient: person('u2') }));
    expect(eventDedupeKey(event, draft)).not.toBe(eventDedupeKey(event, { ...draft, scope: 'a2' }));
  });

  it('makes a reminder key unique per rule, person and day', () => {
    expect(reminderDedupeKey('monthly', 'u1', '2026-10-14')).not.toBe(reminderDedupeKey('monthly', 'u1', '2026-10-15'));
    expect(reminderDedupeKey('monthly', 'u1', '2026-10-14')).not.toBe(reminderDedupeKey('digest', 'u1', '2026-10-14'));
  });

  it('keeps the first draft for a person and subject, so a double role gets one message', () => {
    const drafts = [
      { recipient: person('u1'), scope: 'a1', tag: 'first' },
      { recipient: person('u1'), scope: 'a1', tag: 'second' },
      { recipient: person('u1'), scope: 'a2', tag: 'other subject' },
      { recipient: person('u2'), scope: 'a1', tag: 'other person' },
    ];
    expect(uniqueByRecipient(drafts).map((d) => d.tag)).toEqual(['first', 'other subject', 'other person']);
  });

  it('reads the actor from the payload only when it is a non-empty string', () => {
    expect(actorOf({ actorId: 'u1' })).toBe('u1');
    expect(actorOf({})).toBeUndefined();
    expect(actorOf({ actorId: '' })).toBeUndefined();
    expect(actorOf({ actorId: 5 })).toBeUndefined();
  });
});
