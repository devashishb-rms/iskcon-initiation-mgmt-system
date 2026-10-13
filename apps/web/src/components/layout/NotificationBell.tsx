'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useT } from '@/i18n/provider';
import { notificationsApi } from '@/lib/api';
import { useSession } from '@/features/auth/session';

export const UNREAD_KEY = ['notifications', 'unread'] as const;

/** Bell with the unread count (from the X-Unread-Count header). A failing endpoint just hides the badge. */
export function NotificationBell() {
  const { t } = useT();
  const { can } = useSession();
  const enabled = can('notification:read');
  const q = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => notificationsApi.list(1, 1),
    enabled,
    refetchInterval: 60_000,
    retry: false,
  });
  if (!enabled) return null;
  const unread = q.data?.unread ?? 0;
  return (
    <Link href="/notifications" className="bell" aria-label={unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.bell')}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path
          d="M12 3a6 6 0 0 0-6 6v3.6L4.4 16A1 1 0 0 0 5.3 17.5h13.4a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6zm-2 16a2 2 0 0 0 4 0z"
          fill="currentColor"
        />
      </svg>
      {unread > 0 ? (
        <span className="badge" aria-hidden="true">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
