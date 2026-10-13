'use client';

import type { GuruDto, RuleSetDto } from '@iskcon/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RequirePermission } from '@/components/layout/RequirePermission';
import { Button, Chip, FormError, SelectField, Spinner, useToast } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { peopleApi, ruleSetsApi } from '@/lib/api';
import { RULE_SETS_KEY } from './keys';
import { RuleSetEditor } from './RuleSetEditor';

export function RuleSetsPage() {
  return (
    <RequirePermission any={['ruleset:read']}>
      <RuleSetsView />
    </RequirePermission>
  );
}

function RuleSetsView() {
  const { t } = useT();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const canEdit = can('ruleset:edit');
  const sets = useQuery({ queryKey: RULE_SETS_KEY, queryFn: ruleSetsApi.list });
  const floor = useQuery({ queryKey: ['rule-floor'], queryFn: ruleSetsApi.floor });
  const gurus = useQuery({ queryKey: ['gurus'], queryFn: peopleApi.gurus, enabled: canEdit });
  const [selected, setSelected] = useState<string | null>(null);
  const [newGuru, setNewGuru] = useState('');

  const create = useMutation({
    mutationFn: () => ruleSetsApi.create(newGuru),
    onSuccess: (rs) => {
      toast.success(t('rules.created'));
      setNewGuru('');
      void qc.invalidateQueries({ queryKey: RULE_SETS_KEY });
      setSelected(rs.id);
    },
  });

  if (sets.isPending || floor.isPending) return <Spinner />;
  if (sets.isError || floor.isError) return <FormError error={sets.error ?? floor.error} />;

  const list = sets.data;
  const current = list.find((s) => s.id === selected) ?? list[0];
  const taken = new Set(list.map((s) => s.guru?.id).filter(Boolean));
  const freeGurus = (gurus.data ?? []).filter((g: GuruDto) => g.active && !taken.has(g.id));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('rules.title')}</h1>
          <p className="lead">{t('rules.lead')}</p>
        </div>
      </header>
      <div className="cols">
        <div className="side-list">
          <ul className="listpick" aria-label={t('rules.list')}>
            {list.map((s: RuleSetDto) => (
              <li key={s.id}>
                <button type="button" className={current?.id === s.id ? 'on' : ''} aria-current={current?.id === s.id ? 'true' : undefined} onClick={() => setSelected(s.id)}>
                  <b>{s.isBaseline ? t('rules.baseline') : (s.guru?.name ?? s.name)}</b>
                  <span className="sub">
                    {s.current ? t('rules.currentVersion', { version: s.current.version }) : t('rules.neverPublished')}
                    {s.draft ? ` · ${t('rules.hasDraft')}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {canEdit ? (
            <div className="panel plain">
              <h2 className="h3">{t('rules.newTitle')}</h2>
              <SelectField label={t('rules.newGuru')} value={newGuru} onChange={(e) => setNewGuru(e.target.value)} hint={freeGurus.length === 0 ? t('rules.noFreeGurus') : t('rules.newHint')}>
                <option value="">{t('rules.pickGuru')}</option>
                {freeGurus.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </SelectField>
              <FormError error={create.error} />
              <div>
                <Button onClick={() => create.mutate()} disabled={!newGuru} loading={create.isPending}>
                  {t('rules.create')}
                </Button>
              </div>
            </div>
          ) : (
            <Chip>{t('rules.readOnly')}</Chip>
          )}
        </div>
        <div className="l">{current ? <RuleSetEditor key={`${current.id}:${current.draft?.id ?? 'none'}:${current.current?.id ?? 'none'}`} ruleSet={current} floor={floor.data} canEdit={canEdit} /> : null}</div>
      </div>
    </div>
  );
}
