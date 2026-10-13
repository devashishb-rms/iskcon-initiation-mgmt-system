'use client';

import type { Permission } from '@iskcon/contracts';
import { homeFor } from '@iskcon/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useSession } from '@/features/auth/session';
import { EmptyState } from '@/components/ui/EmptyState';
import { useT } from '@/i18n/provider';

/** Hides a whole screen from roles that cannot use it. The API still refuses them; this is courtesy. */
export function RequirePermission({ any, children }: { any: Permission[]; children: ReactNode }) {
  const { can, roles } = useSession();
  const { t } = useT();
  if (any.some(can)) return <>{children}</>;
  return (
    <EmptyState title={t('guard.title')}>
      <p>{t('guard.body')}</p>
      <Link className="btn" href={homeFor(roles)}>
        {t('guard.home')}
      </Link>
    </EmptyState>
  );
}
