'use client';

import type { RuleSetDto, TimelineEvent } from '@iskcon/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { DataTable, FormError, Spinner } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { applicationsApi, ruleSetsApi } from '@/lib/api';

export const timelineKey = (id: string) => ['timeline', id] as const;

/** version id -> "GBC baseline v2", built from the rule sets the viewer may read. */
export function versionLabels(ruleSets: RuleSetDto[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const rs of ruleSets) for (const v of rs.versions) m.set(v.id, `${rs.name} v${v.version}`);
  return m;
}

export function Timeline({ applicationId, currentVersion }: { applicationId: string; currentVersion?: { id: string; label: string } }) {
  const { t, msg, dateTime } = useT();
  const { can } = useSession();
  const events = useQuery({ queryKey: timelineKey(applicationId), queryFn: () => applicationsApi.timeline(applicationId) });
  const sets = useQuery({ queryKey: ['rule-sets'], queryFn: ruleSetsApi.list, enabled: can('ruleset:read') });
  const labels = useMemo(() => {
    const m = sets.data ? versionLabels(sets.data) : new Map<string, string>();
    if (currentVersion && !m.has(currentVersion.id)) m.set(currentVersion.id, currentVersion.label);
    return m;
  }, [sets.data, currentVersion]);

  if (events.isPending) return <Spinner />;
  const rows = [...(events.data ?? [])].sort((a: TimelineEvent, b: TimelineEvent) => b.at.localeCompare(a.at));
  return (
    <div className="stack">
      <FormError error={events.error} />
      <DataTable
        caption={t('timeline.caption')}
        rows={rows}
        rowKey={(e) => e.id}
        empty={<span className="muted">{t('timeline.none')}</span>}
        columns={[
          { key: 'when', header: t('timeline.when'), mobileLabel: t('timeline.when'), cell: (e) => dateTime(e.at) },
          { key: 'who', header: t('timeline.who'), mobileLabel: t('timeline.who'), cell: (e) => e.actor ?? t('timeline.system') },
          { key: 'what', header: t('timeline.what'), cell: (e) => msg(e.summary) },
          {
            key: 'rule',
            header: t('timeline.ruleVersion'),
            mobileLabel: t('timeline.ruleVersion'),
            cell: (e) => (e.ruleSetVersionId ? (labels.get(e.ruleSetVersionId) ?? t('timeline.ruleVersionUnknown')) : ''),
          },
        ]}
      />
      <p className="sub">{t('timeline.note')}</p>
    </div>
  );
}
