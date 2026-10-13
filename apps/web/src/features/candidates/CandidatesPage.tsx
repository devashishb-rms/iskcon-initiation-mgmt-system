'use client';

import { APPLICATION_STATUSES, STAGES, type CandidateListItem } from '@iskcon/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { Button, CheckboxField, Chip, DataTable, EmptyState, FileLink, FormError, Pager, SelectField, Spinner, TextField } from '@/components/ui';
import { ChecklistSummary } from '@/features/application/Checklist';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { candidatesApi, peopleApi, type CandidateFilters } from '@/lib/api';
import { TRACKS } from '@/lib/enums';
import { useDebounced } from '@/lib/use-debounced';
import { AddCandidateDialog } from './AddCandidateDialog';

const PAGE_SIZE = 25;

export function CandidatesPage() {
  return (
    <RequirePermission any={['candidate:read:any', 'candidate:read:assigned']}>
      <CandidatesView />
    </RequirePermission>
  );
}

function CandidatesView() {
  const { t, tc, date } = useT();
  const { can } = useSession();
  const isMentorView = can('candidate:read:assigned') && !can('candidate:read:any');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');
  const [track, setTrack] = useState('');
  const [guruId, setGuruId] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const search = useDebounced(q.trim());

  const filters: CandidateFilters = {
    q: search || undefined,
    stage: (stage || undefined) as CandidateFilters['stage'],
    status: (status || undefined) as CandidateFilters['status'],
    track: (track || undefined) as CandidateFilters['track'],
    guruId: guruId || undefined,
    mentorId: mentorId || undefined,
    waitingOnMentor: isMentorView && waiting,
  };

  const list = useQuery({
    queryKey: ['candidates', filters, page],
    queryFn: () => candidatesApi.list({ ...filters, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const gurus = useQuery({ queryKey: ['gurus'], queryFn: peopleApi.gurus });
  const mentors = useQuery({ queryKey: ['mentors'], queryFn: peopleApi.mentors, enabled: !isMentorView });

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const rows = list.data?.items ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{isMentorView ? t('candidates.titleMine') : t('candidates.title')}</h1>
          <p className="lead">{isMentorView ? t('candidates.leadMine') : t('candidates.lead')}</p>
        </div>
        <div className="row">
          {can('candidate:export') ? (
            <FileLink href={candidatesApi.exportCsvUrl(filters)} download>
              {t('candidates.exportCsv')}
            </FileLink>
          ) : null}
          {can('candidate:create') ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              {t('candidates.add')}
            </Button>
          ) : null}
        </div>
      </header>

      <form className="filters card pad" role="search" aria-label={t('candidates.filters')} onSubmit={(e) => e.preventDefault()}>
        <TextField label={t('candidates.search')} type="search" value={q} onChange={(e) => change(setQ)(e.target.value)} placeholder={t('candidates.searchPlaceholder')} />
        <SelectField label={t('candidates.stage')} value={stage} onChange={(e) => change(setStage)(e.target.value)}>
          <option value="">{t('candidates.allStages')}</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {tc(`stage.${s}`)}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('candidates.status')} value={status} onChange={(e) => change(setStatus)(e.target.value)}>
          <option value="">{t('candidates.allStatuses')}</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tc(`appStatus.${s}`)}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('candidates.track')} value={track} onChange={(e) => change(setTrack)(e.target.value)}>
          <option value="">{t('candidates.allTracks')}</option>
          {TRACKS.map((s) => (
            <option key={s} value={s}>
              {tc(`track.${s}`)}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('candidates.guru')} value={guruId} onChange={(e) => change(setGuruId)(e.target.value)}>
          <option value="">{t('candidates.allGurus')}</option>
          {(gurus.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </SelectField>
        {!isMentorView ? (
          <SelectField label={t('candidates.mentor')} value={mentorId} onChange={(e) => change(setMentorId)(e.target.value)}>
            <option value="">{t('candidates.allMentors')}</option>
            {(mentors.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
        ) : (
          <CheckboxField label={t('candidates.waitingOnMe')} checked={waiting} onChange={(e) => change(setWaiting)(e.target.checked)} />
        )}
      </form>

      <FormError error={list.error} />
      {list.isPending ? (
        <Spinner />
      ) : (
        <div className="card" aria-busy={list.isFetching}>
          <DataTable<CandidateListItem>
            caption={t('candidates.caption')}
            rows={rows}
            rowKey={(r) => r.applicationId}
            empty={<EmptyState title={t('candidates.empty')}>{t('candidates.emptyHint')}</EmptyState>}
            columns={[
              {
                key: 'name',
                header: t('candidates.col.name'),
                cell: (r) => (
                  <>
                    <Link href={`/candidates/${r.applicationId}`} className="strong">
                      {r.name}
                    </Link>
                    <div className="sub">
                      {tc(`track.${r.track}`)}
                      {r.groupName ? ` · ${r.groupName}` : ''}
                    </div>
                  </>
                ),
              },
              {
                key: 'stage',
                header: t('candidates.col.stage'),
                mobileLabel: t('candidates.col.stage'),
                cell: (r) => (
                  <>
                    <Chip tone="teal">{tc(`stage.${r.stage}`)}</Chip>
                    {r.status !== 'OPEN' ? <Chip tone="amber">{tc(`appStatus.${r.status}`)}</Chip> : null}
                  </>
                ),
              },
              { key: 'guru', header: t('candidates.col.guru'), mobileLabel: t('candidates.col.guru'), cell: (r) => r.guru?.name ?? <span className="muted">{t('common.none')}</span> },
              { key: 'mentor', header: t('candidates.col.mentor'), mobileLabel: t('candidates.col.mentor'), cell: (r) => r.mentor?.name ?? <span className="muted">{t('common.none')}</span> },
              {
                key: 'check',
                header: t('candidates.col.checklist'),
                mobileLabel: t('candidates.col.checklist'),
                cell: (r) => (r.stage === 'INITIATED' ? <span className="muted">{t('candidates.complete')}</span> : <ChecklistSummary {...r.checklist} />),
              },
              {
                key: 'next',
                header: t('candidates.col.next'),
                mobileLabel: t('candidates.col.next'),
                cell: (r) => <span className="sub-ink">{tc(`nextStep.${r.nextStep.code}`, r.nextStep.dueOn ? { dueOn: date(r.nextStep.dueOn) } : undefined)}</span>,
              },
              {
                key: 'open',
                header: t('common.open'),
                srOnlyHeader: true,
                className: 'actions',
                cell: (r) => (
                  <Link href={`/candidates/${r.applicationId}`} className="btn small">
                    {t('common.open')}
                    <span className="sr"> {r.name}</span>
                  </Link>
                ),
              },
            ]}
          />
        </div>
      )}
      {list.data ? <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} /> : null}

      <AddCandidateDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
