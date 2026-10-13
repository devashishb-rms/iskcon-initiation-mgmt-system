/**
 * The vocabulary of the notifications module. A *kind* groups messages for policy (which channels,
 * how urgent); a *code* names one translatable message. The web app renders IN_APP notifications from
 * the code and its parameters, so codes are part of the API: never rename one (see CODES.md).
 */
import { ALL_MESSAGE_CODES, MESSAGE_CODES, NOTIFICATION_KINDS, type MessageCode, type NotificationKind } from '@iskcon/contracts';

// The vocabulary itself lives in @iskcon/contracts so the web app and the API share one list.
export { ALL_MESSAGE_CODES, MESSAGE_CODES, NOTIFICATION_KINDS };
export type { MessageCode, NotificationKind };

export type MessageParams = Record<string, string | number>;
export interface NotificationMessage {
  code: MessageCode;
  params: MessageParams;
}

export type Channel = 'IN_APP' | 'EMAIL' | 'SMS';
