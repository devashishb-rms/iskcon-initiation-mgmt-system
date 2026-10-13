import type { Channel, NotificationKind } from './notification-kinds';
import type { Recipient } from './recipient';

const ALL: readonly Channel[] = ['IN_APP', 'EMAIL', 'SMS'];
const IN_APP_AND_EMAIL: readonly Channel[] = ['IN_APP', 'EMAIL'];

/**
 * Which channels a kind is allowed to use. Outcomes a person must act on or will be waiting for use
 * every channel; informational messages stay in the app and the inbox. Adding a kind forces a decision
 * here (the record type has no default).
 */
const WANTED: Record<NotificationKind, readonly Channel[]> = {
  WELCOME: ALL,
  MENTOR_ASSIGNED: IN_APP_AND_EMAIL,
  APPLICATION_SUBMITTED: IN_APP_AND_EMAIL,
  SENT_BACK: ALL,
  APPROVED: ALL,
  DECLINED: ALL,
  GURU_RESPONSE: ALL,
  DOCUMENT_UPLOADED: IN_APP_AND_EMAIL,
  CEREMONY_COMPLETED: IN_APP_AND_EMAIL,
  MONTHLY_NOTE_DUE: IN_APP_AND_EMAIL,
  FILES_WAITING: IN_APP_AND_EMAIL,
};

export const wantedChannels = (kind: NotificationKind): readonly Channel[] => WANTED[kind];

/** The channels that will really be used: wanted by the kind AND reachable for this person. */
export function selectChannels(kind: NotificationKind, recipient: Pick<Recipient, 'email' | 'phone'>, smsEnabled: boolean): Channel[] {
  return wantedChannels(kind).filter((channel) => {
    if (channel === 'IN_APP') return true;
    if (channel === 'EMAIL') return Boolean(recipient.email);
    return smsEnabled && Boolean(recipient.phone);
  });
}
