import { z } from 'zod';
import { isoDateTime, message } from './common';

export const notificationDto = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  /** Translatable: `code` plus `params`. */
  message: message,
  link: z.string().nullable(),
  createdAt: isoDateTime,
  readAt: isoDateTime.nullable(),
});
export type NotificationDto = z.infer<typeof notificationDto>;

/** A kind groups messages for policy (which channels, how urgent). */
export const NOTIFICATION_KINDS = [
  'WELCOME',
  'MENTOR_ASSIGNED',
  'APPLICATION_SUBMITTED',
  'SENT_BACK',
  'APPROVED',
  'DECLINED',
  'GURU_RESPONSE',
  'DOCUMENT_UPLOADED',
  'CEREMONY_COMPLETED',
  'MONTHLY_NOTE_DUE',
  'FILES_WAITING',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** One translatable message each. The web app renders in-app notifications from the code and its params. */
export const MESSAGE_CODES = {
  welcome: 'notification.welcome',
  mentorAssigned: 'notification.mentorAssigned',
  fileWaiting: 'notification.fileWaiting',
  sentBackStaff: 'notification.sentBack.staff',
  sentBackSelf: 'notification.sentBack.self',
  approvedStaff: 'notification.approved.staff',
  approvedSelf: 'notification.approved.self',
  declinedStaff: 'notification.declined.staff',
  declinedSelf: 'notification.declined.self',
  guruResponseStaff: 'notification.guruResponse.staff',
  guruResponseSelf: 'notification.guruResponse.self',
  documentUploaded: 'notification.documentUploaded',
  ceremonyCompletedStaff: 'notification.ceremonyCompleted.staff',
  ceremonyCompletedSelf: 'notification.ceremonyCompleted.self',
  monthlyNoteDue: 'notification.monthlyNoteDue',
  filesWaiting: 'notification.filesWaiting',
} as const;
export type MessageCode = (typeof MESSAGE_CODES)[keyof typeof MESSAGE_CODES];
export const ALL_MESSAGE_CODES: readonly MessageCode[] = Object.values(MESSAGE_CODES);
