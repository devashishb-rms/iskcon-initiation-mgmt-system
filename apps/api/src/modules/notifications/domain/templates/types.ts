import type { MessageCode, MessageParams } from '../notification-kinds';

/** What EMAIL and SMS carry. Plain text only. */
export interface RenderedMessage {
  subject: string;
  body: string;
  /** One short sentence: SMS costs money and is read on a small screen. */
  sms: string;
}

export type Template = (params: SafeParams) => RenderedMessage;
export type TemplateSet = Record<MessageCode, Template>;

/** Parameters after sanitising: every value is a string without control characters or angle brackets. */
export type SafeParams = Record<string, string>;
export type { MessageParams };
