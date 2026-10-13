'use client';

import type { ImportPreview } from '@iskcon/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { Button, CheckboxField, Chip, DataTable, FileLink, FormError, StatusBadge } from '@/components/ui';
import { useT } from '@/i18n/provider';
import { importsApi } from '@/lib/api';

export function ImportPage() {
  return (
    <RequirePermission any={['import:run']}>
      <ImportWizard />
    </RequirePermission>
  );
}

type Row = ImportPreview['results'][number];

const ROW_STATUS = { OK: 'MET', WARNING: 'UNKNOWN', ERROR: 'NOT_MET' } as const;

function ImportWizard() {
  const { t, tc, msg } = useT();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const preview = useMutation({ mutationFn: (f: File) => importsApi.preview(f) });
  const commit = useMutation({
    mutationFn: (id: string) => importsApi.commit(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['candidates'] }),
  });

  const data = preview.data;
  const done = commit.data;
  const step = done ? 4 : data ? 3 : file ? 2 : 1;
  const importable = data ? data.totals.ok + data.totals.warnings : 0;
  const rows = (data?.results ?? []).filter((r) => !onlyProblems || r.status !== 'OK');

  const reset = () => {
    setFile(null);
    setConsent(false);
    preview.reset();
    commit.reset();
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('import.title')}</h1>
          <p className="lead">{t('import.lead')}</p>
        </div>
      </header>

      <ol className="wizard" aria-label={t('import.steps')}>
        {(['template', 'upload', 'check', 'done'] as const).map((s, i) => (
          <li key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''} aria-current={step === i + 1 ? 'step' : undefined}>
            <span className="n" aria-hidden="true">{i + 1}</span> {t(`import.step.${s}`)}
          </li>
        ))}
      </ol>

      {!done ? (
        <section className="card pad stack" aria-labelledby="imp-up">
          <h2 id="imp-up" className="h3">{t('import.uploadTitle')}</h2>
          <p>
            <FileLink href={importsApi.templateUrl()} download>
              {t('import.template')}
            </FileLink>
          </p>
          <p className="sub">{t('import.templateHint')}</p>
          <div className="field">
            <label htmlFor="import-file">{t('import.file')}</label>
            <input
              id="import-file"
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setConsent(false);
                preview.reset();
              }}
            />
          </div>
          <FormError error={preview.error} />
          <div>
            <Button variant="primary" disabled={!file} loading={preview.isPending} onClick={() => file && preview.mutate(file)}>
              {t('import.check')}
            </Button>
          </div>
        </section>
      ) : null}

      {data && !done ? (
        <section className="card" aria-labelledby="imp-prev">
          <h2 id="imp-prev" className="card-h">
            {t('import.previewTitle', { name: data.filename })}
          </h2>
          <div className="pad stack">
            <div className="chips" data-testid="import-totals">
              <Chip>{t('import.total.rows', { count: data.totals.rows })}</Chip>
              <StatusBadge status="MET" label={t('import.total.ok', { count: data.totals.ok })} />
              <StatusBadge status="UNKNOWN" label={t('import.total.warnings', { count: data.totals.warnings })} />
              <StatusBadge status="NOT_MET" label={t('import.total.errors', { count: data.totals.errors })} />
            </div>
            <CheckboxField label={t('import.onlyProblems')} checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
          </div>
          <DataTable<Row>
            caption={t('import.previewCaption')}
            rows={rows}
            rowKey={(r) => String(r.line)}
            empty={<span className="muted">{t('import.noRows')}</span>}
            columns={[
              { key: 'line', header: t('import.col.line'), cell: (r) => r.line },
              { key: 'status', header: t('import.col.status'), mobileLabel: t('import.col.status'), cell: (r) => <StatusBadge status={ROW_STATUS[r.status]} label={t(`import.rowStatus.${r.status}`)} /> },
              { key: 'name', header: t('import.col.name'), mobileLabel: t('import.col.name'), cell: (r) => String(r.row.name ?? '') },
              {
                key: 'contact',
                header: t('import.col.contact'),
                mobileLabel: t('import.col.contact'),
                cell: (r) => String(r.row.email ?? r.row.phone ?? ''),
              },
              { key: 'track', header: t('import.col.track'), mobileLabel: t('import.col.track'), cell: (r) => (r.row.track ? tc(`track.${String(r.row.track)}`) : '') },
              {
                key: 'messages',
                header: t('import.col.messages'),
                cell: (r) =>
                  r.messages.length === 0 ? (
                    <span className="muted">–</span>
                  ) : (
                    <ul className="plain-list">
                      {r.messages.map((m, i) => (
                        <li key={`${m.code}-${i}`}>{msg(m)}</li>
                      ))}
                    </ul>
                  ),
              },
            ]}
          />
          <div className="pad stack">
            <p className="sub">{t('import.commitNote', { count: importable })}</p>
            <CheckboxField label={t('import.consent')} hint={t('import.consentHint')} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <FormError error={commit.error} />
            <div className="row">
              <Button variant="primary" disabled={!consent || importable === 0} loading={commit.isPending} onClick={() => commit.mutate(data.id)}>
                {t('import.commit', { count: importable })}
              </Button>
              <Button onClick={reset} disabled={commit.isPending}>
                {t('import.startOver')}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {done ? (
        <section className="card pad stack" aria-live="polite" data-testid="import-done">
          <h2 className="h3">{t('import.doneTitle')}</h2>
          <p>{t('import.doneBody', { created: done.created, skipped: done.skipped })}</p>
          <div className="row">
            <Link className="btn primary" href="/candidates">
              {t('import.viewCandidates')}
            </Link>
            <Button onClick={reset}>{t('import.another')}</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
