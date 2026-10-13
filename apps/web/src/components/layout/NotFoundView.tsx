'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { useT } from '@/i18n/provider';

export function NotFoundView() {
  const { t } = useT();
  return (
    <div className="auth-wrap">
      <main className="auth-card">
        <EmptyState title={t('notFound.title')}>
          <p>{t('notFound.body')}</p>
          <Link className="btn primary" href="/">
            {t('guard.home')}
          </Link>
        </EmptyState>
      </main>
    </div>
  );
}
