'use client';

import { useT } from '@/i18n/provider';
import { Button } from './Button';

export interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pager({ page, pageSize, total, onPage }: PagerProps) {
  const { t } = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <div className="sub">{t('pager.total', { total })}</div>;
  return (
    <nav className="pager" aria-label={t('pager.label')}>
      <Button small onClick={() => onPage(page - 1)} disabled={page <= 1}>
        {t('pager.previous')}
      </Button>
      <span aria-live="polite">{t('pager.status', { page, pages, total })}</span>
      <Button small onClick={() => onPage(page + 1)} disabled={page >= pages}>
        {t('pager.next')}
      </Button>
    </nav>
  );
}
