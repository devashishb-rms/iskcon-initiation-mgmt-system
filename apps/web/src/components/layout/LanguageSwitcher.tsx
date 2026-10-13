'use client';

import { LOCALES, type Locale } from '@iskcon/contracts';
import { LOCALE_NAMES } from '@/i18n/core';
import { useT } from '@/i18n/provider';

const SHORT: Record<Locale, string> = { en: 'EN', bn: 'বাং', hi: 'हि' };

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useT();
  return (
    <div className="lang" role="group" aria-label={t('lang.label')}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          aria-label={LOCALE_NAMES[l]}
          className={locale === l ? 'on' : ''}
          onClick={() => setLocale(l)}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}
