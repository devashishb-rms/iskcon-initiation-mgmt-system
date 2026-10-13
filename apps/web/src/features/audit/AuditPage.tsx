'use client';

import type { AuditEntryDto } from '@iskcon/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { DataTable, EmptyState, FormError, Pager, Spinner, TextField } from '@/components/ui';
import { useT } from '@/i18n/provider';
import { auditApi } from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AuditPage() {
  return (
    <RequirePermission any={['audit:read']}>
      <AuditView />
    </RequirePermission>
  );
}

function AuditView() {
  const { t, dateTime } = useT();
  const [action, setAction] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [page, setPage] = useState(1);
  const a = useDebounced(action.trim());
  const app = useDebounced(applicationId.trim());
  const appValid = app === '' || UUID.test(app);
  const q = useQuery({
    queryKey: ['audit', a, app, page],
    queryFn: () => auditApi.list({ action: a || undefined, applicationId: app || undefined, page, pageSize: PAGE_SIZE }),
    enabled: appValid,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('audit.title')}</h1>
          <p className="lead">{t('audit.lead')}</p>
        </div>
      </header>
      <form className="filters card pad" role="search" aria-label={t('audit.filters')} onSubmit={(e) => e.preventDefault()}>
        <TextField label={t('audit.action')} hint={t('audit.actionHint')} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        <TextField
          label={t('audit.application')}
          value={applicationId}
          error={appValid ? null : t('audit.applicationInvalid')}
          onChange={(e) => { setApplicationId(e.target.value); setPage(1); }}
        />
      </form>
      <FormError error={q.error} />
      {q.isPending && appValid ? (
        <Spinner />
      ) : (
        <div className="card">
          <DataTable<AuditEntryDto>
            caption={t('audit.caption')}
            rows={q.data?.items ?? []}
            rowKey={(r) => String(r.id)}
            empty={<EmptyState title={t('audit.empty')} />}
            columns={[
              { key: 'at', header: t('audit.col.when'), cell: (r) => dateTime(r.at) },
              { key: 'who', header: t('audit.col.who'), mobileLabel: t('audit.col.who'), cell: (r) => r.actorName },
              { key: 'action', header: t('audit.col.action'), mobileLabel: t('audit.col.action'), cell: (r) => <code>{r.action}</code> },
              { key: 'entity', header: t('audit.col.entity'), mobileLabel: t('audit.col.entity'), cell: (r) => r.entityType },
              {
                key: 'app',
                header: t('audit.col.application'),
                mobileLabel: t('audit.col.application'),
                cell: (r) => (r.applicationId ? <Link href={`/candidates/${r.applicationId}`}>{t('audit.openFile')}</Link> : <span className="muted">–</span>),
              },
              {
                key: 'detail',
                header: t('audit.col.detail'),
                cell: (r) =>
                  r.detail === null || r.detail === undefined ? (
                    <span className="muted">–</span>
                  ) : (
                    <details>
                      <summary>{t('audit.showDetail')}</summary>
                      <pre className="json">{JSON.stringify(r.detail, null, 2)}</pre>
                    </details>
                  ),
              },
            ]}
          />
        </div>
      )}
      {q.data ? <Pager page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} /> : null}
    </div>
  );
}
