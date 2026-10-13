'use client';

import type { ReviewQueueItem } from '@iskcon/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { Chip, DataTable, EmptyState, FormError, Pager, Spinner, StatusBadge } from '@/components/ui';
import { ChecklistSummary } from '@/features/application/Checklist';
import { useT } from '@/i18n/provider';
import { reviewApi } from '@/lib/api';

const PAGE_SIZE = 25;

export function QueuePage() {
  return (
    <RequirePermission any={['recommendation:decide']}>
      <QueueView />
    </RequirePermission>
  );
}

function QueueView() {
  const { t, tc } = useT();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['review-queue', page], queryFn: () => reviewApi.queue(page, PAGE_SIZE), placeholderData: keepPreviousData });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('queue.title')}</h1>
          <p className="lead">{t('queue.lead')}</p>
        </div>
        {q.data ? <Chip tone="teal">{t('queue.count', { count: q.data.total })}</Chip> : null}
      </header>
      <FormError error={q.error} />
      {q.isPending ? (
        <Spinner />
      ) : (
        <div className="card">
          <DataTable<ReviewQueueItem>
            caption={t('queue.caption')}
            rows={q.data?.items ?? []}
            rowKey={(r) => r.applicationId}
            empty={<EmptyState title={t('queue.empty')} />}
            columns={[
              {
                key: 'name',
                header: t('candidates.col.name'),
                cell: (r) => (
                  <>
                    <Link href={`/candidates/${r.applicationId}`} className="strong">
                      {r.name}
                    </Link>
                    <div className="sub">{tc(`track.${r.track}`)}</div>
                  </>
                ),
              },
              {
                key: 'guru',
                header: t('queue.col.guruRules'),
                mobileLabel: t('queue.col.guruRules'),
                cell: (r) => (
                  <>
                    {r.guru?.name ?? <span className="muted">{t('common.none')}</span>}
                    <div className="sub">{r.ruleVersionLabel}</div>
                  </>
                ),
              },
              { key: 'check', header: t('candidates.col.checklist'), mobileLabel: t('candidates.col.checklist'), cell: (r) => <ChecklistSummary {...r.checklist} /> },
              {
                key: 'approve',
                header: t('queue.col.canApprove'),
                mobileLabel: t('queue.col.canApprove'),
                cell: (r) =>
                  r.canApprove ? (
                    <StatusBadge status="MET" label={t('queue.canApprove.yes')} />
                  ) : (
                    <StatusBadge status="NOT_MET" label={t('queue.canApprove.no')} />
                  ),
              },
              {
                key: 'docs',
                header: t('queue.col.missingDocs'),
                mobileLabel: t('queue.col.missingDocs'),
                cell: (r) =>
                  r.missingDocuments.length === 0 ? (
                    <span className="muted">{t('common.none')}</span>
                  ) : (
                    <span>{r.missingDocuments.map((d) => tc(`docType.${d}`)).join(', ')}</span>
                  ),
              },
              { key: 'wait', header: t('queue.col.waiting'), mobileLabel: t('queue.col.waiting'), cell: (r) => t('queue.days', { count: r.waitingDays }) },
              {
                key: 'open',
                header: t('common.open'),
                srOnlyHeader: true,
                className: 'actions',
                cell: (r) => (
                  <Link href={`/candidates/${r.applicationId}`} className="btn primary small">
                    {t('queue.review')}
                    <span className="sr"> {r.name}</span>
                  </Link>
                ),
              },
            ]}
          />
        </div>
      )}
      {q.data ? <Pager page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} /> : null}
      <p className="sub">{t('queue.legend')}</p>
    </div>
  );
}
