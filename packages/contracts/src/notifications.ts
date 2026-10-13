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

export const NOTIFICATION_KINDS = [
  'DOCUMENT_MISSING',
  'ELIGIBILITY_DATE_REACHED',
  'CEREMONY_UPCOMING',
  'APPLICATION_SUBMITTED',
  'SENT_BACK',
  'APPROVED',
  'GURU_RESPONSE',
] as const;
