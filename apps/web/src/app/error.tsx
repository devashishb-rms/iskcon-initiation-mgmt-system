'use client';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useT } from '@/i18n/provider';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { t } = useT();
  return (
    <div className="auth-wrap">
      <main className="auth-card">
        <EmptyState title={t('error.INTERNAL')}>
          <Button variant="primary" onClick={reset}>
            {t('common.tryAgain')}
          </Button>
        </EmptyState>
      </main>
    </div>
  );
}
