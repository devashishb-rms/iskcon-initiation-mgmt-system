'use client';

import type { RuleFloorResponse, RuleParamsDto, RuleSetDto } from '@iskcon/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Chip, ConfirmDialog, DataTable, Field, FormError, TextField, useToast } from '@/components/ui';
import { useT } from '@/i18n/provider';
import { isApiError, ruleSetsApi } from '@/lib/api';
import { DOCUMENT_TYPES } from '@/lib/enums';
import { useFieldErrorText } from '@/lib/use-error-text';
import { FLAG_FIELDS, NUMERIC_FIELDS, diffParams, draftFromParams, notWholeMonths, paramLabelKey, paramsFromDraft, sameDraft, type ParamsDraft } from './params';
import { RULE_SETS_KEY } from './keys';

export interface RuleSetEditorProps {
  ruleSet: RuleSetDto;
  floor: RuleFloorResponse;
  canEdit: boolean;
}

export function RuleSetEditor({ ruleSet, floor, canEdit }: RuleSetEditorProps) {
  const { t, tc, dateTime } = useT();
  const fieldText = useFieldErrorText();
  const qc = useQueryClient();
  const toast = useToast();

  const base: RuleParamsDto = ruleSet.draft?.params ?? ruleSet.current?.params ?? floor.baseline;
  const [draft, setDraft] = useState<ParamsDraft>(() => draftFromParams(base));
  const [note, setNote] = useState(ruleSet.draft?.note ?? '');
  const [confirm, setConfirm] = useState<'publish' | 'discard' | null>(null);
  const baselineDraft = draftFromParams(base);
  const dirty = !sameDraft(draft, baselineDraft) || note !== (ruleSet.draft?.note ?? '');

  // The minimum a value may take: the GBC floor for the temple baseline, the baseline for a guru's set.
  const minimum = ruleSet.isBaseline ? floor.floor : floor.baseline;

  const refresh = () => qc.invalidateQueries({ queryKey: RULE_SETS_KEY });
  // Months must be whole numbers; checked here so the person gets the right message without a round trip.
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => ruleSetsApi.saveDraft(ruleSet.id, paramsFromDraft(draft), note.trim()),
    onSuccess: () => {
      toast.success(t('rules.draftSaved'));
      void refresh();
    },
  });
  const publish = useMutation({
    mutationFn: () => ruleSetsApi.publish(ruleSet.id),
    onSuccess: (rs) => {
      setConfirm(null);
      toast.success(t('rules.published', { version: rs.current?.version ?? '' }));
      void refresh();
    },
  });
  const discard = useMutation({
    mutationFn: () => ruleSetsApi.discardDraft(ruleSet.id),
    onSuccess: () => {
      setConfirm(null);
      toast.success(t('rules.draftDiscarded'));
      void refresh();
    },
  });

  // Inline errors: 422 RULE_BELOW_FLOOR carries one entry per field (path = field name).
  const fieldErrors: Record<string, string> = { ...localErrors };
  if (isApiError(save.error)) for (const e of save.error.errors) fieldErrors[e.path.replace(/^params\./, '')] = fieldText(e);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  const versions = [...ruleSet.versions].sort((a, b) => b.version - a.version);
  const byVersion = new Map(ruleSet.versions.map((v) => [v.version, v]));

  return (
    <div className="stack-lg">
      <section className="card" aria-labelledby="rs-h">
        <h2 id="rs-h" className="card-h">
          {ruleSet.isBaseline ? t('rules.baseline') : (ruleSet.guru?.name ?? ruleSet.name)}
          <span className="chips">
            {ruleSet.current ? <Chip tone="teal">{t('rules.currentVersion', { version: ruleSet.current.version })}</Chip> : null}
            {ruleSet.draft ? <Chip tone="amber">{t('rules.hasDraft')}</Chip> : null}
          </span>
        </h2>
        <form
          className="pad stack-lg"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canEdit) return;
            save.reset();
            const bad = notWholeMonths(draft);
            setLocalErrors(Object.fromEntries(bad.map((k) => [k, t('error.field.NOT_WHOLE_MONTHS')])));
            if (bad.length === 0) save.mutate();
          }}
          noValidate
        >
          {!ruleSet.isBaseline ? <p className="sub">{t('rules.guruSetIntro')}</p> : <p className="sub">{t('rules.baselineIntro')}</p>}
          <div className="grid2">
            {NUMERIC_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={
                  <>
                    <span className="rule-id">{f.rule}</span>
                    {t(paramLabelKey(f.key))}
                  </>
                }
                error={fieldErrors[f.key]}
                hint={
                  <>
                    <span className="floor" data-floor={f.key}>
                      {t('rules.gbcFloor', { value: floor.floor[f.key] })}
                    </span>
                    {!ruleSet.isBaseline ? (
                      <span className="floor block">{t('rules.baselineFloor', { value: floor.baseline[f.key] })}</span>
                    ) : null}
                  </>
                }
              >
                {(c) => (
                  <input
                    {...c}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={240}
                    step={1}
                    disabled={!canEdit}
                    value={draft.numbers[f.key]}
                    onChange={(e) => setDraft({ ...draft, numbers: { ...draft.numbers, [f.key]: e.target.value } })}
                  />
                )}
              </Field>
            ))}
          </div>

          <fieldset className="stack">
            <legend>{t('rules.switches')}</legend>
            {FLAG_FIELDS.map((f) => (
              <div key={f.key} className="check">
                <input
                  id={`flag-${f.key}`}
                  type="checkbox"
                  disabled={!canEdit}
                  checked={draft.flags[f.key]}
                  aria-describedby={`flag-${f.key}-hint`}
                  aria-invalid={fieldErrors[f.key] ? true : undefined}
                  onChange={(e) => setDraft({ ...draft, flags: { ...draft.flags, [f.key]: e.target.checked } })}
                />
                <label htmlFor={`flag-${f.key}`}>
                  <span className="rule-id">{f.rule}</span>
                  {t(paramLabelKey(f.key))}
                  <span id={`flag-${f.key}-hint`} className="hint block">
                    {minimum[f.key] ? t('rules.mustStayOn') : t('rules.optionalSwitch')}
                  </span>
                  {fieldErrors[f.key] ? <span className="field-error block">{fieldErrors[f.key]}</span> : null}
                </label>
              </div>
            ))}
          </fieldset>

          <fieldset className="stack">
            <legend>{t('rules.requiredDocs')}</legend>
            <p className="sub">{t('rules.requiredDocsHint')}</p>
            <div className="checks">
              {DOCUMENT_TYPES.map((d) => (
                <div key={d} className="check">
                  <input
                    id={`doc-${d}`}
                    type="checkbox"
                    disabled={!canEdit}
                    checked={draft.requiredDocuments.includes(d)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        requiredDocuments: e.target.checked ? [...draft.requiredDocuments, d] : draft.requiredDocuments.filter((x) => x !== d),
                      })
                    }
                  />
                  <label htmlFor={`doc-${d}`}>{tc(`docType.${d}`)}</label>
                </div>
              ))}
            </div>
          </fieldset>

          {canEdit ? (
            <>
              <TextField label={t('rules.note')} hint={t('rules.noteHint')} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              {hasFieldErrors ? (
                <div className="note-box bad" role="alert" data-testid="floor-error">
                  {t('rules.belowFloorSummary')}
                </div>
              ) : (
                <FormError error={save.error} />
              )}
              <FormError error={publish.error} />
              <div className="row">
                <Button type="submit" variant="primary" loading={save.isPending} disabled={!dirty && !!ruleSet.draft}>
                  {t('rules.saveDraft')}
                </Button>
                {ruleSet.draft ? (
                  <>
                    <Button onClick={() => setConfirm('publish')} disabled={dirty}>
                      {t('rules.publish')}
                    </Button>
                    <Button variant="danger" onClick={() => setConfirm('discard')}>
                      {t('rules.discard')}
                    </Button>
                  </>
                ) : null}
              </div>
              {ruleSet.draft && dirty ? <p className="sub">{t('rules.saveBeforePublish')}</p> : null}
            </>
          ) : (
            <p className="sub">{t('rules.readOnlyHint')}</p>
          )}
        </form>
      </section>

      <section className="card" aria-labelledby="hist-h">
        <h2 id="hist-h" className="card-h">
          {t('rules.history')}
        </h2>
        <DataTable
          caption={t('rules.historyCaption')}
          rows={versions}
          rowKey={(v) => v.id}
          empty={<span className="muted">{t('rules.noVersions')}</span>}
          columns={[
            { key: 'v', header: t('rules.col.version'), cell: (v) => <b>v{v.version}</b> },
            { key: 's', header: t('rules.col.status'), mobileLabel: t('rules.col.status'), cell: (v) => <Chip tone={v.status === 'PUBLISHED' ? 'teal' : 'amber'}>{t(`rules.status.${v.status}`)}</Chip> },
            { key: 'who', header: t('rules.col.who'), mobileLabel: t('rules.col.who'), cell: (v) => v.createdBy },
            { key: 'when', header: t('rules.col.when'), mobileLabel: t('rules.col.when'), cell: (v) => dateTime(v.publishedAt ?? v.createdAt) },
            {
              key: 'changes',
              header: t('rules.col.changes'),
              cell: (v) => {
                const prev = byVersion.get(v.version - 1);
                const shown = prev ? diffParams(prev.params, v.params) : null;
                return (
                  <>
                    {shown === null ? <span className="muted">{t('rules.firstVersion')}</span> : shown.length === 0 ? <span className="muted">{t('rules.noChanges')}</span> : null}
                    <ul className="plain-list">
                      {(shown ?? []).map((c) => (
                        <li key={c.field}>
                          {t(paramLabelKey(c.field))}: {c.from || '–'} → {c.to || '–'}
                        </li>
                      ))}
                    </ul>
                    {v.note ? <div className="sub">{v.note}</div> : null}
                  </>
                );
              },
            },
          ]}
        />
      </section>

      <ConfirmDialog
        open={confirm === 'publish'}
        onClose={() => setConfirm(null)}
        onConfirm={() => publish.mutate()}
        title={t('rules.publishTitle')}
        confirmLabel={t('rules.publish')}
        busy={publish.isPending}
        error={publish.error}
      >
        <p>{t('rules.publishBody')}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'discard'}
        onClose={() => setConfirm(null)}
        onConfirm={() => discard.mutate()}
        title={t('rules.discardTitle')}
        confirmLabel={t('rules.discard')}
        danger
        busy={discard.isPending}
        error={discard.error}
      >
        <p>{t('rules.discardBody')}</p>
      </ConfirmDialog>
    </div>
  );
}
