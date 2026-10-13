'use client';

import { useState } from 'react';
import { Button, FormError, Spinner, Tabs, panelProps } from '@/components/ui';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { useT } from '@/i18n/provider';
import { Checklist } from './Checklist';
import { DocumentsPanel } from './Documents';
import { useApplicationRefresh, useMyPath } from './hooks';
import { NextStepCard } from './NextStepCard';
import { latestOpenSendBack, NotesThread, useNotes } from './NotesThread';
import { StageStepper } from './StageStepper';

type TabId = 'path' | 'documents' | 'messages';

export function PathPage() {
  return (
    <RequirePermission any={['candidate:read:own']}>
      <PathView />
    </RequirePermission>
  );
}

function PathView() {
  const { t, tc, dateTime } = useT();
  const q = useMyPath();
  const refresh = useApplicationRefresh();
  const [tab, setTab] = useState<TabId>('path');
  const notes = useNotes(q.data?.applicationId ?? '');

  if (q.isPending) return <Spinner />;
  if (q.isError) return <FormError error={q.error} />;
  const d = q.data;
  const first = d.candidate.name.split(' ')[0] ?? d.candidate.name;
  const sendBack = notes.data ? latestOpenSendBack(notes.data) : null;
  const tabs = [
    { id: 'path', label: t('path.tab.path') },
    { id: 'documents', label: t('path.tab.documents') },
    { id: 'messages', label: t('path.tab.messages') },
  ];
  const wantsCertificate = d.nextStep.code === 'UPLOAD_COURSE_CERTIFICATE';

  return (
    <div className="stack-lg path">
      <div>
        <h1>{t('path.greeting', { name: first })}</h1>
        <p className="lead">{tc(`path.subtitle.${d.track}`)}</p>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as TabId)} label={t('path.tabs')} idBase="path" className="tabs-phone" />

      {tab === 'path' ? (
        <div {...panelProps('path', 'path')} className="stack-lg">
          <section className="card pad" aria-label={t('path.stageCard')}>
            <StageStepper stage={d.stage} track={d.track} caption />
            <p className="sub">{d.guru ? t('path.guru', { name: d.guru.name }) : t('path.noGuru')}</p>
          </section>
          {sendBack ? (
            <section className="note-box warn" role="note" data-testid="send-back">
              <b>{t('path.sentBack')}</b>
              <span className="block">{sendBack.body}</span>
              <span className="sub">
                {sendBack.author.name} · {dateTime(sendBack.createdAt)}
              </span>
            </section>
          ) : null}
          <NextStepCard
            nextStep={d.nextStep}
            action={
              wantsCertificate ? (
                <Button className="on-teal" onClick={() => setTab('documents')}>
                  {t('path.uploadCertificate')}
                </Button>
              ) : undefined
            }
          />
          <section aria-labelledby="chk-h" className="stack">
            <h2 id="chk-h">{t('path.checklistTitle')}</h2>
            <Checklist evaluation={d.evaluation} />
          </section>
        </div>
      ) : null}

      {tab === 'documents' ? (
        <section {...panelProps('path', 'documents')} className="stack">
          <h2>{t('path.documentsTitle')}</h2>
          <DocumentsPanel detail={d} onChanged={() => refresh()} phone />
        </section>
      ) : null}

      {tab === 'messages' ? (
        <section {...panelProps('path', 'messages')} className="stack">
          <h2>{t('path.messagesTitle')}</h2>
          <p className="sub">{t('path.mentor', { name: d.mentor?.name ?? t('common.none') })}</p>
          <NotesThread detail={d} onChanged={() => refresh()} />
        </section>
      ) : null}
    </div>
  );
}
