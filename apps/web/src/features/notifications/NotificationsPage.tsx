'use client';

import type { NotificationDto } from '@iskcon/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { UNREAD_KEY } from '@/components/layout/NotificationBell';
import { Button, EmptyState, FormError, Pager, Spinner } from '@/components/ui';
import { useT } from '@/i18n/provider';
import { notificationsApi } from '@/lib/api';
import { notificationHref } from '@/lib/safe-path';

const PAGE_SIZE = 20;

export function NotificationsPage() {
  return (
    <RequirePermission any={['notification:read']}>
      <NotificationsView />
    </RequirePermission>
  );
}

function NotificationsView() {
  const { t, msg, dateTime } = useT();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['notifications', 'list', page], queryFn: () => notificationsApi.list(page, PAGE_SIZE), placeholderData: keepPreviousData });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: UNREAD_KEY });
  };
  const markRead = useMutation({ mutationFn: (id: string) => notificationsApi.markRead(id), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: refresh });

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>{t('notifications.title')}</h1>
          {q.data ? <p className="lead">{t('notifications.unreadCount', { count: q.data.unread })}</p> : null}
        </div>
        <Button onClick={() => markAll.mutate()} loading={markAll.isPending} disabled={!q.data || q.data.unread === 0}>
          {t('notifications.markAll')}
        </Button>
      </header>
      <FormError error={q.error ?? markRead.error ?? markAll.error} />
      {q.isPending ? <Spinner /> : null}
      {q.data && q.data.items.length === 0 ? <EmptyState title={t('notifications.empty')} /> : null}
      <ul className="notifications">
        {(q.data?.items ?? []).map((n: NotificationDto) => {
          const href = notificationHref(n.link);
          const unread = n.readAt === null;
          return (
            <li key={n.id} className={unread ? 'notification unread' : 'notification'} data-unread={unread}>
              <div className="m">
                {unread ? <span className="chip teal"><i aria-hidden="true" />{t('notifications.new')}</span> : null}
                <p className="strong">{msg(n.message)}</p>
                <p className="sub">{dateTime(n.createdAt)}</p>
              </div>
              <div className="row">
                {href ? (
                  <Link className="btn small" href={href} onClick={() => unread && markRead.mutate(n.id)}>
                    {t('common.open')}
                  </Link>
                ) : null}
                {unread ? (
                  <Button small onClick={() => markRead.mutate(n.id)} disabled={markRead.isPending}>
                    {t('notifications.markRead')}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {q.data ? <Pager page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} /> : null}
    </div>
  );
}
