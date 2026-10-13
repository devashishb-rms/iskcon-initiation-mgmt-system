'use client';

import type { ApplicationDetail } from '@iskcon/contracts';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, Chip, Field, FormError, useToast } from '@/components/ui';
import { useT } from '@/i18n/provider';
import { applicationsApi } from '@/lib/api';
import { EXAM_STATUSES } from '@/lib/enums';
import { diffFacts, draftFromFacts, visibleFacts, type FactDraft, type FactField } from './facts';

export interface FactsPanelProps {
  detail: ApplicationDetail;
  onChanged: (d: ApplicationDetail) => void;
}

/**
 * What the record says. Each field is editable only when the server's `actions` allow it
 * (mentor: practice start; committee/admin: the temple's facts). "Not recorded" is shown as
 * "needs confirming", never as a failure.
 */
export function FactsPanel({ detail, onChanged }: FactsPanelProps) {
  const { t, tc, date } = useT();
  const toast = useToast();
  const editable = (f: FactField) => detail.actions[f.editableBy];
  const fields = visibleFacts(detail.track, detail.facts, editable);
  const [draft, setDraft] = useState<FactDraft>(() => draftFromFacts(detail.facts));
  const factsKey = JSON.stringify(detail.facts);

  useEffect(() => {
    setDraft(draftFromFacts(detail.facts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factsKey]);

  const save = useMutation({
    mutationFn: () => applicationsApi.updateFacts(detail.applicationId, diffFacts(detail.facts, draft, editable)),
    onSuccess: (d) => {
      toast.success(t('facts.saved'));
      onChanged(d);
    },
  });

  const changes = diffFacts(detail.facts, draft, editable);
  const dirty = Object.keys(changes).length > 0;
  const anyEditable = fields.some(editable);

  const readOnly = (f: FactField) => {
    const v = detail.facts[f.key];
    if (v === null) {
      return (
        <span className="fact-unknown">
          <Chip tone="amber">{t('status.UNKNOWN')}</Chip> <span className="sub">{t('facts.notRecorded')}</span>
        </span>
      );
    }
    if (f.input === 'date') return <span>{date(String(v))}</span>;
    if (f.input === 'exam') return <span>{tc(`examStatus.${String(v)}`)}</span>;
    return <span>{t(v === true ? 'facts.courseYes' : 'facts.courseNo')}</span>;
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save.mutate();
      }}
    >
      <div className="facts">
        {fields.map((f) => (
          <div key={f.key} className="fact" data-fact={f.key}>
            {editable(f) ? (
              <Field label={tc(`fact.${f.key}`)} hint={f.optional ? t('facts.optionalHint') : t('facts.unknownHint')}>
                {(c) =>
                  f.input === 'date' ? (
                    <input {...c} type="date" value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                  ) : f.input === 'exam' ? (
                    <select {...c} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
                      <option value="">{t('facts.notRecordedOption')}</option>
                      {EXAM_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {tc(`examStatus.${s}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select {...c} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
                      <option value="">{t('facts.notRecordedOption')}</option>
                      <option value="true">{t('facts.courseYes')}</option>
                      <option value="false">{t('facts.courseNo')}</option>
                    </select>
                  )
                }
              </Field>
            ) : (
              <>
                <div className="fact-label">{tc(`fact.${f.key}`)}</div>
                <div>{readOnly(f)}</div>
              </>
            )}
          </div>
        ))}
      </div>
      {anyEditable ? (
        <>
          <FormError error={save.error} />
          <div className="row">
            <Button type="submit" variant="primary" disabled={!dirty} loading={save.isPending}>
              {t('facts.save')}
            </Button>
            {dirty ? (
              <Button onClick={() => setDraft(draftFromFacts(detail.facts))} disabled={save.isPending}>
                {t('common.undo')}
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="sub">{t('facts.readOnly')}</p>
      )}
    </form>
  );
}
