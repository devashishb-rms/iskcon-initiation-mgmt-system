'use client';

import type { ReactNode } from 'react';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import { SignOutButton } from './SignOut';
import { Brand } from './StaffShell';

/** The candidate's phone-sized frame: large touch targets, one column, language switcher always in reach. */
export function PhoneShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  const session = useSession();
  return (
    <div className="phonewrap">
      <a href="#main" className="skip">
        {t('common.skipToContent')}
      </a>
      <div className="phone">
        <header className="phone-top">
          <Brand />
          <div className="topbar-tools">
            <LanguageSwitcher />
            <NotificationBell />
          </div>
        </header>
        <main id="main" className="phone-body" tabIndex={-1}>
          {children}
          <footer className="phone-foot">
            <span>{session.user.name}</span> · <SignOutButton className="link" />
          </footer>
        </main>
      </div>
    </div>
  );
}
