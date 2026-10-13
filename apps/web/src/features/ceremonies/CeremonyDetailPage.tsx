'use client';

import type { CeremonyAttendeeDto, CeremonyDto } from '@iskcon/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { Button, Chip, ConfirmDialog, DataTable, EmptyState, FormError, Spinner, TextField, useToast } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { ceremoniesApi, isApiError } from '@/lib/api';
import { useFieldErrorText } from '@/lib/use-error-text';
import { CEREMONIES_KEY, statusTone } from './CeremoniesPage';

const ceremonyKey = (id: string) => ['ceremony', id] as const;

export function CeremonyDetailPage({ id }: { id: string }) {
  return (
    <RequirePermission any={['ceremony:read']}>
      <DetailView id={id} />
    </RequirePermission>
  );
}

/** Present attendees who still have no spiritual name (the API requires one for each). */
export function missingNames(attendees: CeremonyAttendeeDto[], names: Record<string, string>): string[] {
  return attendees.filter((a) => a.present && !(names[a.applicationId] ?? a.spiritualName ?? '').trim()).map((a) => a.applicationId);
}

function DetailView({ id }: { id: string }) {
  const { t, tc, date } = useT();
  const fieldText = useFieldErrorText();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ceremonyKey(id), queryFn: () => ceremoniesApi.get(id) });
  const manage = can('ceremony:manage');
  const planned = q.data?.status === 'PLANNED';
  const eligible = useQuery({ queryKey: ['ceremony-eligible', id], queryFn: () => ceremoniesApi.eligible(id), enabled: manage && planned });
  const [names, setNames] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<'complete' | 'cancel' | null>(null);
  const [nameErrors, setNameErrors] = useState<string[]>([]);

  const sync = (c: CeremonyDto) => {
    qc.setQueryData(ceremonyKey(id), c);
    void qc.invalidateQueries({ queryKey: CEREMONIES_KEY });
    void qc.invalidateQueries({ queryKey: ['ceremony-eligible', id] });
  };
  const attach = useMutation({ mutationFn: (appId: string) => ceremoniesApi.attach(id, appId), onSuccess: sync });
  const detach = useMutation({ mutationFn: (appId: string) => ceremoniesApi.detach(id, appId), onSuccess: sync });
  const mark = useMutation({ mutationFn: (v: { appId: string; present: boolean }) => ceremoniesApi.markAttendance(id, v.appId, v.present), onSuccess: sync });
  const complete = useMutation({
    mutationFn: () => {
      const payload: Record<string, string> = {};
      for (const a of q.data?.attendees ?? []) if (a.present) payload[a.applicationId] = (names[a.applicationId] ?? a.spiritualName ?? '').trim();
      return ceremoniesApi.complete(id, payload);
    },
    onError: (e) => {
      setConfirm(null);
      if (isApiError(e)) {
        const ids = e.errors.filter((x) => x.code === 'SPIRITUAL_NAME_REQUIRED').map((x) => x.path.replace('spiritualNames.', ''));
        if (ids.length) setNameErrors(ids);
      }
    },
    onSuccess: (c) => {
      setConfirm(null);
      toast.success(t('ceremony.completed'));
      sync(c);
      void qc.invalidateQueries({ queryKey: ['register'] });
      void qc.invalidateQueries({ queryKey: ['candidates'] });
    },
  });
  const cancel = useMutation({
    mutationFn: () => ceremoniesApi.cancel(id),
    onSuccess: (c) => {
      setConfirm(null);
      toast.success(t('ceremony.cancelled'));
      sync(c);
    },
  });

  if (q.isPending) return <Spinner />;
  if (q.isError) return <FormError error={q.error} />;
  const c = q.data;
  const editable = manage && c.status === 'PLANNED';
  const busy = attach.isPending || detach.isPending || mark.isPending;

  const askComplete = () => {
    const missing = missingNames(c.attendees, names);
    setNameErrors(missing);
    if (missing.length === 0) setConfirm('complete');
  };

  return (
    <div className="page">
      <Link href="/ceremonies" className="backlink">
        {t('ceremony.back')}
      </Link>
      <header className="page-head">
        <div>
          <h1>{t('ceremony.heading', { guru: c.guru.name, date: date(c.date, 'long') })}</h1>
          <p className="lead">
            {tc(`track.${c.track}`)} · {c.venue}
          </p>
        </div>
        <Chip tone={statusTone(c.status)}>{tc(`ceremonyStatus.${c.status}`)}</Chip>
      </header>

      <section className="card" aria-labelledby="att-h">
        <h2 id="att-h" className="card-h">
          {t('ceremony.attendees')}
        </h2>
        <FormError error={attach.error ?? detach.error ?? mark.error} />
        <DataTable<CeremonyAttendeeDto>
          caption={t('ceremony.attendeesCaption')}
          rows={c.attendees}
          rowKey={(a) => a.applicationId}
          empty={<EmptyState title={t('ceremony.noAttendees')}>{editable ? t('ceremony.noAttendeesHint') : null}</EmptyState>}
          columns={[
            {
              key: 'name',
              header: t('ceremony.col.name'),
              cell: (a) =>
                can('candidate:read:any') ? (
                  <Link href={`/candidates/${a.applicationId}`} className="strong">
                    {a.candidateName}
                  </Link>
                ) : (
                  <span className="strong">{a.candidateName}</span>
                ),
            },
            {
              key: 'present',
              header: t('ceremony.col.present'),
              mobileLabel: t('ceremony.col.present'),
              cell: (a) =>
                editable ? (
                  <label className="check-inline">
                    <input type="checkbox" checked={a.present} disabled={busy} onChange={(e) => mark.mutate({ appId: a.applicationId, present: e.target.checked })} />
                    <span>{t('ceremony.present')}</span>
                    <span className="sr"> {a.candidateName}</span>
                  </label>
                ) : (
                  <Chip tone={a.present ? 'teal' : 'plain'}>{a.present ? t('ceremony.present') : t('ceremony.absent')}</Chip>
                ),
            },
            {
              key: 'spiritual',
              header: t('ceremony.col.spiritualName'),
              mobileLabel: t('ceremony.col.spiritualName'),
              cell: (a) =>
                editable && a.present ? (
                  <TextField
                    label={<span className="sr">{t('ceremony.spiritualNameFor', { name: a.candidateName })}</span>}
                    value={names[a.applicationId] ?? a.spiritualName ?? ''}
                    maxLength={120}
                    error={nameErrors.includes(a.applicationId) ? t('ceremony.spiritualNameRequired') : null}
                    onChange={(e) => setNames({ ...names, [a.applicationId]: e.target.value })}
                  />
                ) : (
                  (a.spiritualName ?? <span className="muted">–</span>)
                ),
            },
            {
              key: 'actions',
              header: t('common.actions'),
              srOnlyHeader: true,
              className: 'actions',
              cell: (a) =>
                editable ? (
                  <Button small variant="danger" disabled={busy} onClick={() => detach.mutate(a.applicationId)}>
                    {t('ceremony.detach')}
                    <span className="sr"> {a.candidateName}</span>
                  </Button>
                ) : null,
            },
          ]}
        />
      </section>

      {editable ? (
        <section className="card" aria-labelledby="elig-h">
          <h2 id="elig-h" className="card-h">
            {t('ceremony.eligible')}
          </h2>
          <div className="pad stack">
            <p className="sub">{t('ceremony.eligibleHint')}</p>
            {eligible.isPending ? <Spinner /> : null}
            <FormError error={eligible.error} />
            {eligible.data && eligible.data.length === 0 ? <p className="muted">{t('ceremony.noEligible')}</p> : null}
            <ul className="items">
              {(eligible.data ?? []).map((p) => (
                <li key={p.applicationId} className="item">
                  <div className="m item-label">{p.candidateName}</div>
                  <Button small onClick={() => attach.mutate(p.applicationId)} disabled={busy}>
                    {t('ceremony.attach')}
                    <span className="sr"> {p.candidateName}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {editable ? (
        <section className="panel" aria-labelledby="fin-h">
          <h2 id="fin-h" className="h3">
            {t('ceremony.finishTitle')}
          </h2>
          <p>{t('ceremony.finishBody')}</p>
          {nameErrors.length > 0 ? <div className="note-box bad" role="alert">{t('ceremony.spiritualNamesMissing')}</div> : null}
          {complete.error && !confirm ? (
            isApiError(complete.error) && complete.error.errors.length > 0 ? (
              <div className="note-box bad" role="alert">
                <ul className="plain-list">
                  {complete.error.errors.map((e) => (
                    <li key={`${e.path}-${e.code}`}>{fieldText(e)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <FormError error={complete.error} />
            )
          ) : null}
          <div className="row">
            <Button variant="primary" onClick={askComplete} disabled={busy}>
              {t('ceremony.complete')}
            </Button>
            <Button variant="danger" onClick={() => setConfirm('cancel')} disabled={busy}>
              {t('ceremony.cancel')}
            </Button>
          </div>
        </section>
      ) : null}
      {c.status === 'COMPLETED' ? (
        <div className="note-box info">
          {t('ceremony.completedNote')} <Link href="/register">{t('ceremony.openRegister')}</Link>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm === 'complete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => complete.mutate()}
        title={t('ceremony.completeTitle')}
        confirmLabel={t('ceremony.complete')}
        busy={complete.isPending}
        error={complete.error}
      >
        <p>{t('ceremony.completeBody', { count: c.attendees.filter((a) => a.present).length })}</p>
        <p className="strong">{t('ceremony.completeWarning')}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        onConfirm={() => cancel.mutate()}
        title={t('ceremony.cancelTitle')}
        confirmLabel={t('ceremony.cancel')}
        danger
        busy={cancel.isPending}
        error={cancel.error}
      >
        <p>{t('ceremony.cancelBody')}</p>
      </ConfirmDialog>
    </div>
  );
}
