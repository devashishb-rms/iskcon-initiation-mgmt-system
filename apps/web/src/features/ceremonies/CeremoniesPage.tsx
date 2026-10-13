'use client';

import type { CeremonyDto } from '@iskcon/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { Button, Chip, DataTable, Dialog, EmptyState, FormError, SelectField, Spinner, TextField, useToast } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { ceremoniesApi, isApiError, peopleApi } from '@/lib/api';
import { TRACKS } from '@/lib/enums';
import { useFieldErrorText } from '@/lib/use-error-text';

export const CEREMONIES_KEY = ['ceremonies'] as const;

export function CeremoniesPage() {
  return (
    <RequirePermission any={['ceremony:read']}>
      <CeremoniesView />
    </RequirePermission>
  );
}

export const statusTone = (s: CeremonyDto['status']) => (s === 'PLANNED' ? 'teal' : s === 'CANCELLED' ? 'amber' : 'plain');

function CeremoniesView() {
  const { t, tc, date } = useT();
  const { can } = useSession();
  const q = useQuery({ queryKey: CEREMONIES_KEY, queryFn: ceremoniesApi.list });
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('ceremonies.title')}</h1>
          <p className="lead">{t('ceremonies.lead')}</p>
        </div>
        {can('ceremony:manage') ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('ceremonies.create')}
          </Button>
        ) : null}
      </header>
      <FormError error={q.error} />
      {q.isPending ? (
        <Spinner />
      ) : (
        <div className="card">
          <DataTable<CeremonyDto>
            caption={t('ceremonies.caption')}
            rows={q.data ?? []}
            rowKey={(c) => c.id}
            empty={<EmptyState title={t('ceremonies.empty')}>{can('ceremony:manage') ? t('ceremonies.emptyHint') : null}</EmptyState>}
            columns={[
              {
                key: 'date',
                header: t('ceremonies.col.date'),
                cell: (c) => (
                  <Link href={`/ceremonies/${c.id}`} className="strong">
                    {date(c.date)}
                  </Link>
                ),
              },
              { key: 'guru', header: t('ceremonies.col.guru'), mobileLabel: t('ceremonies.col.guru'), cell: (c) => c.guru.name },
              { key: 'track', header: t('ceremonies.col.track'), mobileLabel: t('ceremonies.col.track'), cell: (c) => tc(`track.${c.track}`) },
              { key: 'venue', header: t('ceremonies.col.venue'), mobileLabel: t('ceremonies.col.venue'), cell: (c) => c.venue },
              { key: 'n', header: t('ceremonies.col.attendees'), mobileLabel: t('ceremonies.col.attendees'), cell: (c) => c.attendees.length },
              { key: 'status', header: t('ceremonies.col.status'), mobileLabel: t('ceremonies.col.status'), cell: (c) => <Chip tone={statusTone(c.status)}>{tc(`ceremonyStatus.${c.status}`)}</Chip> },
              {
                key: 'open',
                header: t('common.open'),
                srOnlyHeader: true,
                className: 'actions',
                cell: (c) => (
                  <Link href={`/ceremonies/${c.id}`} className="btn small">
                    {t('common.open')}
                    <span className="sr"> {date(c.date)}</span>
                  </Link>
                ),
              },
            ]}
          />
        </div>
      )}
      <CreateCeremonyDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateCeremonyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, tc } = useT();
  const fieldText = useFieldErrorText();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const gurus = useQuery({ queryKey: ['gurus'], queryFn: peopleApi.gurus, enabled: open });
  const [guruId, setGuruId] = useState('');
  const [track, setTrack] = useState<'FIRST' | 'SECOND'>('FIRST');
  const [venue, setVenue] = useState('');
  const [day, setDay] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () => ceremoniesApi.create({ guruId, track, venue: venue.trim(), date: day }),
    onSuccess: (c) => {
      toast.success(t('ceremonies.created'));
      void qc.invalidateQueries({ queryKey: CEREMONIES_KEY });
      onClose();
      setVenue('');
      setDay('');
      router.push(`/ceremonies/${c.id}`);
    },
    onError: (e) => {
      if (isApiError(e)) setErrors(Object.fromEntries(e.errors.map((fe) => [fe.path, fieldText(fe)])));
    },
  });

  function submit() {
    const next: Record<string, string> = {};
    if (!guruId) next.guruId = t('ceremonies.guruRequired');
    if (!venue.trim()) next.venue = t('ceremonies.venueRequired');
    if (!day) next.date = t('ceremonies.dateRequired');
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('ceremonies.createTitle')}
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={create.isPending}>
            {t('ceremonies.createSubmit')}
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
        <SelectField label={t('ceremonies.col.guru')} required value={guruId} error={errors.guruId} onChange={(e) => setGuruId(e.target.value)}>
          <option value="">{t('ceremonies.pickGuru')}</option>
          {(gurus.data ?? []).filter((g) => g.active).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('ceremonies.col.track')} value={track} onChange={(e) => setTrack(e.target.value === 'SECOND' ? 'SECOND' : 'FIRST')}>
          {TRACKS.map((tr) => (
            <option key={tr} value={tr}>
              {tc(`track.${tr}`)}
            </option>
          ))}
        </SelectField>
        <TextField label={t('ceremonies.col.venue')} required value={venue} maxLength={200} error={errors.venue} onChange={(e) => setVenue(e.target.value)} />
        <TextField label={t('ceremonies.col.date')} type="date" required value={day} error={errors.date} onChange={(e) => setDay(e.target.value)} />
        <FormError error={create.error} />
      </form>
    </Dialog>
  );
}
