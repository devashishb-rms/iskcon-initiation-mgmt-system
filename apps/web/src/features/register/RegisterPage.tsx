'use client';

import { correctRegisterBody, type RegisterEntryDto } from '@iskcon/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { Button, DataTable, Dialog, EmptyState, FileLink, FormError, Pager, SelectField, Spinner, TextAreaField, TextField, useToast } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { peopleApi, registerApi, type RegisterFilters } from '@/lib/api';
import { TRACKS } from '@/lib/enums';
import { useDebounced } from '@/lib/use-debounced';

const PAGE_SIZE = 25;

export function RegisterPage() {
  return (
    <RequirePermission any={['register:read']}>
      <RegisterView />
    </RequirePermission>
  );
}

/** Calendar-date range check on `YYYY-MM-DD` strings (plain string comparison is correct for ISO dates). */
export const inRange = (day: string, from: string, to: string): boolean => (!from || day >= from) && (!to || day <= to);

function RegisterView() {
  const { t, tc, date } = useT();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [guruId, setGuruId] = useState('');
  const [track, setTrack] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [correcting, setCorrecting] = useState<RegisterEntryDto | null>(null);
  const search = useDebounced(q.trim());

  const filters: RegisterFilters = {
    q: search || undefined,
    guruId: guruId || undefined,
    track: (track || undefined) as RegisterFilters['track'],
    from: from || undefined,
    to: to || undefined,
  };
  const list = useQuery({
    queryKey: ['register', filters, page],
    queryFn: () => registerApi.list({ ...filters, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const gurus = useQuery({ queryKey: ['gurus'], queryFn: peopleApi.gurus });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const rows = (list.data?.items ?? []).filter((r) => inRange(r.initiatedOn, from, to));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('register.title')}</h1>
          <p className="lead">{t('register.lead')}</p>
        </div>
        {can('register:export') ? (
          <div className="row">
            <FileLink href={registerApi.exportCsvUrl(filters)} download>
              {t('register.exportCsv')}
            </FileLink>
            <FileLink href={registerApi.exportPdfUrl(filters)} target="_blank" rel="noopener noreferrer">
              {t('register.exportPdf')}
            </FileLink>
          </div>
        ) : null}
      </header>

      <form className="filters card pad" role="search" aria-label={t('register.filters')} onSubmit={(e) => e.preventDefault()}>
        <TextField label={t('register.search')} type="search" value={q} placeholder={t('register.searchPlaceholder')} onChange={(e) => reset(setQ)(e.target.value)} />
        <SelectField label={t('candidates.guru')} value={guruId} onChange={(e) => reset(setGuruId)(e.target.value)}>
          <option value="">{t('candidates.allGurus')}</option>
          {(gurus.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('candidates.track')} value={track} onChange={(e) => reset(setTrack)(e.target.value)}>
          <option value="">{t('candidates.allTracks')}</option>
          {TRACKS.map((tr) => (
            <option key={tr} value={tr}>
              {tc(`track.${tr}`)}
            </option>
          ))}
        </SelectField>
        <TextField label={t('register.from')} type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
        <TextField label={t('register.to')} type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} />
      </form>

      <FormError error={list.error} />
      {list.isPending ? (
        <Spinner />
      ) : (
        <div className="card" aria-busy={list.isFetching}>
          <DataTable<RegisterEntryDto>
            caption={t('register.caption')}
            rows={rows}
            rowKey={(r) => r.id}
            empty={<EmptyState title={t('register.empty')} />}
            columns={[
              { key: 'date', header: t('register.col.date'), cell: (r) => date(r.initiatedOn) },
              { key: 'name', header: t('register.col.name'), mobileLabel: t('register.col.name'), cell: (r) => <span className="strong">{r.candidateName}</span> },
              { key: 'spiritual', header: t('register.col.spiritualName'), mobileLabel: t('register.col.spiritualName'), cell: (r) => r.spiritualName },
              { key: 'track', header: t('register.col.track'), mobileLabel: t('register.col.track'), cell: (r) => tc(`track.${r.track}`) },
              { key: 'guru', header: t('register.col.guru'), mobileLabel: t('register.col.guru'), cell: (r) => r.guru.name },
              {
                key: 'ceremony',
                header: t('register.col.ceremony'),
                mobileLabel: t('register.col.ceremony'),
                cell: (r) =>
                  can('ceremony:read') ? (
                    <Link href={`/ceremonies/${r.ceremonyId}`}>{t('register.openCeremony')}</Link>
                  ) : (
                    <span className="muted">–</span>
                  ),
              },
              {
                key: 'actions',
                header: t('common.actions'),
                srOnlyHeader: true,
                className: 'actions',
                cell: (r) =>
                  can('register:correct') ? (
                    <Button small onClick={() => setCorrecting(r)}>
                      {t('register.correct')}
                      <span className="sr"> {r.candidateName}</span>
                    </Button>
                  ) : null,
              },
            ]}
          />
        </div>
      )}
      {list.data ? <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} /> : null}

      {correcting ? (
        <CorrectDialog
          key={correcting.id}
          entry={correcting}
          onClose={() => setCorrecting(null)}
          onDone={() => {
            setCorrecting(null);
            toast.success(t('register.corrected'));
            void qc.invalidateQueries({ queryKey: ['register'] });
          }}
        />
      ) : null}
    </div>
  );
}

function CorrectDialog({ entry, onClose, onDone }: { entry: RegisterEntryDto; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(entry.spiritualName);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ name?: string; reason?: string }>({});
  const save = useMutation({ mutationFn: () => registerApi.correct(entry.id, name.trim(), reason.trim()), onSuccess: onDone });

  function submit() {
    const parsed = correctRegisterBody.safeParse({ spiritualName: name, reason });
    const next: { name?: string; reason?: string } = {};
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        if (i.path[0] === 'spiritualName') next.name = t('register.nameRequired');
        if (i.path[0] === 'reason') next.reason = t('register.reasonRequired');
      }
    }
    setErrors(next);
    if (parsed.success) save.mutate();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('register.correctTitle', { name: entry.candidateName })}
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {t('register.correctSubmit')}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="sub">{t('register.correctIntro')}</p>
        <TextField label={t('register.col.spiritualName')} required value={name} maxLength={120} error={errors.name} onChange={(e) => setName(e.target.value)} />
        <TextAreaField label={t('register.reason')} hint={t('register.reasonHint')} required value={reason} maxLength={500} error={errors.reason} onChange={(e) => setReason(e.target.value)} />
        <FormError error={save.error} />
      </form>
    </Dialog>
  );
}
