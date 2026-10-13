'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { SessionLoader } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { localeFromCookieHeader } from '@/lib/locale-cookie';
import { Spinner } from '@/components/ui/Spinner';
import { isCandidateOnly, titleKeyFor } from './nav';
import { PhoneShell } from './PhoneShell';
import { StaffShell } from './StaffShell';

/** Everything behind sign-in: loads the session, enforces the second factor, picks the right shell. */
export function AppFrame({ children }: { children: ReactNode }) {
  return <SessionLoader>{(session) => <Gate mfaPending={session.mfa.required && !session.mfa.verified} candidateOnly={isCandidateOnly(session.roles)} language={session.user.locale} timeZone={session.tenant.timezone}>{children}</Gate>}</SessionLoader>;
}

function Gate({
  mfaPending,
  candidateOnly,
  language,
  timeZone,
  children,
}: {
  mfaPending: boolean;
  candidateOnly: boolean;
  language: 'en' | 'bn' | 'hi';
  timeZone: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale, setLocale, setTimeZone } = useT();

  useEffect(() => {
    const key = titleKeyFor(pathname);
    document.title = key ? `${t(key)} · ${t('brand.name')}` : t('brand.name');
  }, [pathname, locale, t]);

  useEffect(() => {
    if (mfaPending) router.replace('/mfa');
  }, [mfaPending, router]);

  useEffect(() => {
    setTimeZone(timeZone);
  }, [timeZone, setTimeZone]);

  // First visit on this device: adopt the language saved on the account. After that the cookie wins.
  useEffect(() => {
    if (!localeFromCookieHeader(document.cookie)) setLocale(language, { remote: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mfaPending) return <Spinner />;
  return candidateOnly ? <PhoneShell>{children}</PhoneShell> : <StaffShell>{children}</StaffShell>;
}
