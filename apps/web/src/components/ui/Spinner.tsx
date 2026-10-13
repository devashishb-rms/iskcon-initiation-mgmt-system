'use client';

import { useT } from '@/i18n/provider';

export function Spinner({ inline, label }: { inline?: boolean; label?: string }) {
  const { t } = useT();
  if (inline) return <span className="spinner" aria-hidden="true" />;
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}
