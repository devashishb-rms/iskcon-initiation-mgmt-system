import { locale as localeSchema, type Locale } from '@iskcon/contracts';

export const LOCALE_COOKIE = 'lang';

export function parseLocale(value: string | null | undefined): Locale | null {
  const r = localeSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** Reads the language from a `Cookie` header string. */
export function localeFromCookieHeader(header: string | null | undefined): Locale | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === LOCALE_COOKIE) return parseLocale(rest.join('='));
  }
  return null;
}

/** The cookie is a preference, not a secret: readable by script, first-party, one year. */
export const serializeLocaleCookie = (locale: Locale): string =>
  `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
