'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Chip, FormError, Spinner, Tabs, panelProps } from '@/components/ui';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { Checklist } from './Checklist';
import { DocumentsPanel } from './Documents';
import { FactsPanel } from './FactsPanel';
import { useApplication, useApplicationRefresh } from './hooks';
import { NextStepCard } from './NextStepCard';
import { NotesThread, useNotes } from './NotesThread';
import { AdvancePanel, ExceptionsPanel, GuruPanel, GuruResponsePanel, HandoffPanel, RecommendationPanel, StatusSummary, SubmitPanel } from './panels';
import { StageStepper } from './StageStepper';
import { Timeline } from './Timeline';

type TabId = 'review' | 'documents' | 'notes' | 'timeline';

export function ApplicationFilePage({ applicationId }: { applicationId: string }) {
  return (
    <RequirePermission any={['candidate:read:any', 'candidate:read:assigned']}>
      <FileView applicationId={applicationId} />
    </RequirePermission>
  );
}

function FileView({ applicationId }: { applicationId: string }) {
  const { t, tc } = useT();
  const { can } = useSession();
  const q = useApplication(applicationId);
  const refresh = useApplicationRefresh();
  const [tab, setTab] = useState<TabId>('review');
  const notes = useNotes(applicationId);

  if (q.isPending) return <Spinner />;
  if (q.isError) return <FormError error={q.error} />;
  const d = q.data;
  const back = can('recommendation:decide') ? { href: '/queue', label: t('file.backQueue') } : { href: '/candidates', label: t('file.backCandidates') };
  const readiness = [...(notes.data ?? [])].filter((n) => n.kind === 'READINESS').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const ruleLabel = `${d.ruleVersion.ruleSetName} v${d.ruleVersion.version}`;

  const tabs = [
    { id: 'review', label: t('file.tab.review') },
    { id: 'documents', label: t('file.tab.documents') },
    { id: 'notes', label: t('file.tab.notes') },
    { id: 'timeline', label: t('file.tab.timeline') },
  ];

  return (
    <div className="page">
      <div>
        <Link href={back.href} className="backlink">
          {back.label}
        </Link>
        <header className="page-head">
          <div>
            <h1>{d.candidate.name}</h1>
            <p className="lead">
              {tc(`track.${d.track}`)} · {t('file.mentor', { name: d.mentor?.name ?? t('common.none') })}
              {d.candidate.groupName ? ` · ${d.candidate.groupName}` : ''}
            </p>
          </div>
          <div className="chips">
            <Chip tone="teal">{tc(`stage.${d.stage}`)}</Chip>
            {d.status !== 'OPEN' ? <Chip tone="amber">{tc(`appStatus.${d.status}`)}</Chip> : null}
            <Chip>{d.guru?.name ?? t('file.noGuru')}</Chip>
            <Chip>{t('file.ruleSet', { label: ruleLabel })}</Chip>
          </div>
        </header>
      </div>

      <div className="card pad">
        <StageStepper stage={d.stage} track={d.track} />
      </div>
      <NextStepCard nextStep={d.nextStep} heading={t('nextStep.headingStaff')} />

      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as TabId)} label={t('file.tabs')} idBase="file" />

      {tab === 'review' ? (
        <div {...panelProps('file', 'review')} className="cols">
          <div className="l">
            <section className="card" aria-labelledby="chk-h">
              <h2 id="chk-h" className="card-h">
                {t('file.checklistTitle', { label: ruleLabel })}
              </h2>
              <div className="pad">
                <Checklist evaluation={d.evaluation} detailed />
              </div>
            </section>
            <section className="card" aria-labelledby="facts-h">
              <h2 id="facts-h" className="card-h">
                {t('file.factsTitle')}
              </h2>
              <div className="pad">
                <FactsPanel detail={d} onChanged={(next) => refresh(next)} />
              </div>
            </section>
            <section className="card" aria-labelledby="ready-h">
              <h2 id="ready-h" className="card-h">
                {t('file.readinessTitle')}
              </h2>
              <div className="pad">
                {readiness ? (
                  <>
                    <p className="sub">{t('file.readinessBy', { name: readiness.author.name })}</p>
                    <p className="msg-body">{readiness.body}</p>
                  </>
                ) : (
                  <p className="muted">{t('file.noReadiness')}</p>
                )}
              </div>
            </section>
          </div>
          <aside className="r" aria-label={t('file.actions')}>
            <StatusSummary detail={d} />
            <RecommendationPanel detail={d} onChanged={refresh} />
            <SubmitPanel detail={d} onChanged={refresh} />
            <AdvancePanel detail={d} onChanged={refresh} />
            <GuruPanel detail={d} onChanged={refresh} />
            <ExceptionsPanel detail={d} onChanged={refresh} />
            <GuruResponsePanel detail={d} onChanged={refresh} />
            <HandoffPanel detail={d} onChanged={refresh} />
          </aside>
        </div>
      ) : null}

      {tab === 'documents' ? (
        <div {...panelProps('file', 'documents')} className="card pad">
          <DocumentsPanel detail={d} onChanged={() => refresh()} />
        </div>
      ) : null}
      {tab === 'notes' ? (
        <div {...panelProps('file', 'notes')} className="card pad">
          <NotesThread detail={d} onChanged={() => refresh()} />
        </div>
      ) : null}
      {tab === 'timeline' ? (
        <div {...panelProps('file', 'timeline')} className="card pad">
          <Timeline applicationId={applicationId} currentVersion={{ id: d.ruleVersion.id, label: ruleLabel }} />
        </div>
      ) : null}
    </div>
  );
}
