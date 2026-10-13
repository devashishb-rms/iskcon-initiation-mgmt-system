'use client';

import { homeFor } from '@iskcon/contracts';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { useSessionQuery } from './session';

/** `/` sends each role to its home screen (HOME_BY_ROLE in the contracts). */
export function HomeRedirect() {
  const router = useRouter();
  const q = useSessionQuery();
  useEffect(() => {
    if (!q.data) return;
    router.replace(q.data.mfa.required && !q.data.mfa.verified ? '/mfa' : homeFor(q.data.user.roles));
  }, [q.data, router]);
  return <Spinner />;
}
