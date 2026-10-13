'use client';

import type { Locale } from '@iskcon/contracts';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { formatCalendarDate, formatInstant } from '@/lib/dates';
import { serializeLocaleCookie } from '@/lib/locale-cookie';
import { translate, translateMessage, type MessageKey, type Params, type ServerMessage } from './core';

export interface I18n {
  locale: Locale;
  /** `remote: false` adopts a language without telling the API (used when the language came from the API). */
  setLocale: (l: Locale, opts?: { remote?: boolean }) => void;
  /** A message the UI itself wrote. Keys are type-checked against en.json. */
  t: (key: MessageKey, params?: Params) => string;
  /** A code that arrived from the API (rule labels, next steps, errors, timeline). */
  tc: (code: string, params?: Params) => string;
  /** A `{code, params}` message from the API. */
  msg: (m: ServerMessage) => string;
  setTimeZone: (tz: string) => void;
  date: (iso: string, style?: 'short' | 'long') => string;
  dateTime: (iso: string, timeZone?: string) => string;
}

const Ctx = createContext<I18n | null>(null);

export interface I18nProviderProps {
  initialLocale: Locale;
  timeZone?: string;
  /** Called after the language changes (the app uses it to tell the API). */
  onLocaleChange?: (l: Locale) => void;
  children: ReactNode;
}

export function I18nProvider({ initialLocale, timeZone: initialTimeZone = 'Asia/Kolkata', onLocaleChange, children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [timeZone, setTimeZone] = useState(initialTimeZone);

  const setLocale = useCallback(
    (l: Locale, opts?: { remote?: boolean }) => {
      setLocaleState(l);
      document.cookie = serializeLocaleCookie(l);
      document.documentElement.lang = l;
      if (opts?.remote !== false) onLocaleChange?.(l);
    },
    [onLocaleChange],
  );

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      tc: (code, params) => translate(locale, code, params),
      msg: (m) => translateMessage(locale, m),
      setTimeZone,
      date: (iso, style) => formatCalendarDate(iso, locale, style),
      dateTime: (iso, tz) => formatInstant(iso, locale, tz ?? timeZone),
    }),
    [locale, setLocale, timeZone],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useT must be used inside <I18nProvider>');
  return v;
}
