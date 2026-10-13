import type { MessageParams } from '../notification-kinds';
import type { SafeParams } from './types';

const MAX_VALUE = 500;
// C0 and C1 control characters (line breaks included) and the Unicode line and paragraph separators.
// eslint-disable-next-line no-control-regex
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+', 'g');

/**
 * Makes a value safe to put into a plain-text message: no control characters or line breaks (a name
 * must not be able to add a mail header or a second paragraph), no angle brackets (nothing may look
 * like markup if a mail client renders the text), bounded length.
 */
export function sanitize(value: string | number): string {
  const text = String(value).replace(CONTROL, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
}

export const sanitizeParams = (params: MessageParams): SafeParams =>
  Object.fromEntries(Object.entries(params).map(([k, v]) => [k, sanitize(v)]));
