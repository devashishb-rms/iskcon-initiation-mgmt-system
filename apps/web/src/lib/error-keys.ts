import { hasMessage } from '@/i18n/core';

type Params = Record<string, string | number> | undefined;

/** The catalogue key for a whole-request error: `error.CONFLICT.EXPIRED` beats `error.CONFLICT` beats `error.UNKNOWN`. */
export function errorKey(code: string, params?: Params): string {
  const reason = params?.reason;
  if (typeof reason === 'string' && hasMessage(`error.${code}.${reason}`)) return `error.${code}.${reason}`;
  const key = `error.${code}`;
  return hasMessage(key) ? key : 'error.UNKNOWN';
}

/** The catalogue key for one field error: `error.field.<code>`, then `error.<code>`, then a generic line. */
export function fieldErrorKey(code: string): string {
  const field = `error.field.${code}`;
  if (hasMessage(field)) return field;
  const generic = `error.${code}`;
  return hasMessage(generic) ? generic : 'error.field.INVALID';
}
