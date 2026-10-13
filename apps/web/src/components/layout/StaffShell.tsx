'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { LanguageSwitcher } from './LanguageSwitcher';
import { isActive, navItemsFor } from './nav';
import { NotificationBell } from './NotificationBell';
import { SignOutButton } from './SignOut';

export function Brand() {
  const { t } = useT();
  return (
    <span className="brand">
      <b aria-hidden="true" />
      {t('brand.name')}
    </span>
  );
}

/** Desktop: left navigation. Phone: a scrolling tab strip under the header. Same links, same markup. */
export function StaffShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  const session = useSession();
  const pathname = usePathname();
  const items = navItemsFor(session.can);
  return (
    <div className="shell">
      <a href="#main" className="skip">
        {t('common.skipToContent')}
      </a>
      <header className="topbar">
        <Brand />
        <div className="topbar-tools">
          <LanguageSwitcher />
          <NotificationBell />
        </div>
      </header>
      <nav className="side" aria-label={t('nav.label')}>
        <div className="side-brand">
          <Brand />
        </div>
        <ul>
          {items.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className={isActive(i, pathname) ? 'nav on' : 'nav'} aria-current={isActive(i, pathname) ? 'page' : undefined}>
                {t(i.label)}
              </Link>
            </li>
          ))}
        </ul>
        <div className="who">
          <div>{t('auth.signedInAs')}</div>
          <b>{session.user.name}</b>
          <div className="who-tools">
            <SignOutButton className="btn small on-dark" />
          </div>
        </div>
      </nav>
      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
