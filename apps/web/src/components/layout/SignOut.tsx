'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '@/i18n/provider';
import { authApi } from '@/lib/api';

export function SignOutButton({ className = 'btn small' }: { className?: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await authApi.logout();
        } catch {
          // Already signed out or the network is down: either way, leave this session behind.
        }
        qc.clear();
        router.replace('/login');
      }}
    >
      {t('auth.signOut')}
    </button>
  );
}
