'use client';

import type { ApplicationDetail, GuruResponseType } from '@iskcon/contracts';
import { decideBody, recordGuruResponseBody, type Decision } from '@iskcon/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Button,
  Chip,
  ConfirmDialog,
  Dialog,
  FileLink,
  FormError,
  SelectField,
  StatusBadge,
  TextAreaField,
  TextField,
  useToast,
} from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useT } from '@/i18n/provider';
import { applicationsApi, peopleApi, saveBlob } from '@/lib/api';

interface PanelProps {
  detail: ApplicationDetail;
  onChanged: (d?: ApplicationDetail) => void;
}

const ruleLabel = (detail: ApplicationDetail, ruleId: string) => detail.evaluation.items.find((i) => i.id === ruleId);

// ───────────── Mentor: readiness note ─────────────

export function SubmitPanel({ detail, onChanged }: PanelProps) {
  const { t } = useT();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const submit = useMutation({
    mutationFn: () => applicationsApi.submit(detail.applicationId, note.trim()),
    onSuccess: (d) => {
      setConfirming(false);
      toast.success(t('submit.done'));
      onChanged(d);
    },
  });
  if (!detail.actions.canSubmit) return null;
  const unmet = detail.evaluation.blockers.length > 0;
  return (
    <section className="panel" aria-labelledby="submit-h">
      <h3 id="submit-h">{t('submit.title')}</h3>
      <p className="sub">{t('submit.intro')}</p>
      {unmet ? <div className="note-box warn">{t('submit.unmetWarning')}</div> : null}
      <TextAreaField label={t('submit.noteLabel')} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} required />
      <div>
        <Button variant="primary" disabled={!note.trim()} onClick={() => setConfirming(true)}>
          {t('submit.button')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => submit.mutate()}
        title={t('submit.confirmTitle')}
        confirmLabel={t('submit.button')}
        busy={submit.isPending}
        error={submit.error}
      >
        <p>{t('submit.confirmBody', { name: detail.candidate.name })}</p>
      </ConfirmDialog>
    </section>
  );
}

// ───────────── Committee/admin: advance stage ─────────────

export function AdvancePanel({ detail, onChanged }: PanelProps) {
  const { t, tc } = useT();
  const toast = useToast();
  const toShelter = detail.stage === 'ASPIRING';
  const [shelterDate, setShelterDate] = useState(detail.facts.shelterDate ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const advance = useMutation({
    mutationFn: () =>
      applicationsApi.advance(detail.applicationId, toShelter ? { to: 'SHELTER', shelterDate } : { to: 'PREPARING' }),
    onSuccess: (d) => {
      toast.success(t('advance.done', { stage: tc(`stage.${d.stage}`) }));
      onChanged(d);
    },
  });
  if (!detail.actions.canAdvance) return null;
  return (
    <section className="panel plain" aria-labelledby="advance-h">
      <h3 id="advance-h">{t('advance.title')}</h3>
      {toShelter ? (
        <TextField
          label={t('advance.shelterDate')}
          hint={t('advance.shelterHint')}
          type="date"
          required
          value={shelterDate}
          error={fieldError}
          onChange={(e) => setShelterDate(e.target.value)}
        />
      ) : (
        <p className="sub">{t('advance.preparingIntro')}</p>
      )}
      <FormError error={advance.error} />
      <div>
        <Button
          variant="primary"
          loading={advance.isPending}
          onClick={() => {
            if (toShelter && !shelterDate) {
              setFieldError(t('advance.shelterRequired'));
              return;
            }
            setFieldError(null);
            advance.mutate();
          }}
        >
          {toShelter ? t('advance.toShelter') : t('advance.toPreparing')}
        </Button>
      </div>
    </section>
  );
}

// ───────────── Committee/admin: choose or change guru ─────────────

export function GuruPanel({ detail, onChanged }: PanelProps) {
  const { t } = useT();
  const toast = useToast();
  const gurus = useQuery({ queryKey: ['gurus'], queryFn: peopleApi.gurus, enabled: detail.actions.canChangeGuru });
  const [guruId, setGuruId] = useState(detail.guru?.id ?? '');
  const save = useMutation({
    mutationFn: () => applicationsApi.changeGuru(detail.applicationId, guruId || null),
    onSuccess: (d) => {
      toast.success(t('guru.saved'));
      onChanged(d);
    },
  });
  if (!detail.actions.canChangeGuru) return null;
  const options = (gurus.data ?? []).filter((g) => g.active || g.id === detail.guru?.id);
  return (
    <section className="panel plain" aria-labelledby="guru-h">
      <h3 id="guru-h">{detail.guru ? t('guru.changeTitle') : t('guru.chooseTitle')}</h3>
      <SelectField label={t('guru.label')} value={guruId} onChange={(e) => setGuruId(e.target.value)} hint={t('guru.hint')}>
        <option value="">{t('guru.none')}</option>
        {options.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </SelectField>
      <FormError error={save.error ?? gurus.error} />
      <div>
        <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={guruId === (detail.guru?.id ?? '')}>
          {t('guru.save')}
        </Button>
      </div>
    </section>
  );
}

// ───────────── Committee: written exceptions ─────────────

export function ExceptionsPanel({ detail, onChanged }: PanelProps) {
  const { t, msg, dateTime } = useT();
  const toast = useToast();
  const canRecord = detail.actions.canRecordException;
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: (ruleId: string) => applicationsApi.recordException(detail.applicationId, ruleId, (reasons[ruleId] ?? '').trim()),
    onSuccess: (_d, ruleId) => {
      setReasons((r) => ({ ...r, [ruleId]: '' }));
      toast.success(t('exceptions.recorded'));
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: (ruleId: string) => applicationsApi.removeException(detail.applicationId, ruleId),
    onSuccess: () => {
      setRemoving(null);
      toast.success(t('exceptions.removed'));
      onChanged();
    },
  });

  const open = detail.evaluation.items.filter((i) => detail.evaluation.blockers.includes(i.id));
  if (!canRecord && detail.exceptions.length === 0) return null;

  return (
    <section className="panel plain" aria-labelledby="exc-h">
      <h3 id="exc-h">{t('exceptions.title')}</h3>
      <p className="sub">{t('exceptions.intro')}</p>

      {detail.exceptions.length > 0 ? (
        <ul className="items">
          {detail.exceptions.map((ex) => {
            const item = ruleLabel(detail, ex.ruleId);
            return (
              <li key={ex.ruleId} className="item" data-exception={ex.ruleId}>
                <div className="m">
                  <div className="item-label">
                    <span className="rule-id">{ex.ruleId}</span>
                    {item ? msg(item.label) : null}
                  </div>
                  <div className="sub">
                    {ex.reason} · {ex.recordedBy} · {dateTime(ex.recordedAt)}
                  </div>
                </div>
                <StatusBadge status="EXCEPTION" />
                {canRecord ? (
                  <Button small variant="danger" onClick={() => setRemoving(ex.ruleId)}>
                    {t('exceptions.remove')}
                    <span className="sr"> {ex.ruleId}</span>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {canRecord && open.length > 0 ? (
        <div className="stack">
          {open.map((item) => (
            <form
              key={item.id}
              className="stack sep"
              onSubmit={(e) => {
                e.preventDefault();
                if ((reasons[item.id] ?? '').trim()) record.mutate(item.id);
              }}
            >
              <div className="item-label">
                <span className="rule-id">{item.id}</span>
                {msg(item.label)} <StatusBadge status={item.status} />
              </div>
              <TextAreaField
                label={t('exceptions.reasonFor', { rule: item.id })}
                value={reasons[item.id] ?? ''}
                maxLength={1000}
                onChange={(e) => setReasons({ ...reasons, [item.id]: e.target.value })}
              />
              <div>
                <Button type="submit" small loading={record.isPending && record.variables === item.id} disabled={!(reasons[item.id] ?? '').trim()}>
                  {t('exceptions.record')}
                  <span className="sr"> {item.id}</span>
                </Button>
              </div>
            </form>
          ))}
          <FormError error={record.error} />
        </div>
      ) : null}
      {canRecord && open.length === 0 && detail.exceptions.length === 0 ? <p className="muted">{t('exceptions.noneNeeded')}</p> : null}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
        title={t('exceptions.removeTitle')}
        confirmLabel={t('exceptions.remove')}
        danger
        busy={remove.isPending}
        error={remove.error}
      >
        <p>{t('exceptions.removeBody', { rule: removing ?? '' })}</p>
      </ConfirmDialog>
    </section>
  );
}

// ───────────── President: recommend, send back, decline ─────────────

export function RecommendationPanel({ detail, onChanged }: PanelProps) {
  const { t, msg } = useT();
  const toast = useToast();
  const { actions } = detail;
  const blocked = actions.approveBlockedBy;
  const [decision, setDecision] = useState<Decision>(blocked.length > 0 ? 'SEND_BACK' : 'APPROVE');
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const decide = useMutation({
    mutationFn: () => applicationsApi.decide(detail.applicationId, { decision, reason: reason.trim() || undefined }),
    onSuccess: (d) => {
      setConfirming(false);
      toast.success(t(`recommendation.done.${decision}`));
      onChanged(d);
    },
    onError: () => setConfirming(false),
  });

  if (!actions.canDecide) return null;

  const needsReason = decision !== 'APPROVE';
  const go = () => {
    const parsed = decideBody.safeParse({ decision, reason: reason.trim() || undefined });
    if (!parsed.success) {
      setFieldError(t('recommendation.reasonRequired'));
      return;
    }
    setFieldError(null);
    if (decision === 'SEND_BACK') decide.mutate();
    else setConfirming(true);
  };

  const options: { value: Decision; label: string; disabled?: boolean }[] = [
    { value: 'APPROVE', label: t('recommendation.approve'), disabled: blocked.length > 0 },
    { value: 'SEND_BACK', label: t('recommendation.sendBack') },
    { value: 'DECLINE', label: t('recommendation.decline') },
  ];

  return (
    <section className="panel" aria-labelledby="rec-h">
      <h3 id="rec-h">{t('recommendation.title')}</h3>
      {blocked.length === 0 ? (
        <div className="note-box info">{t('recommendation.okNote')}</div>
      ) : (
        <div className="note-box bad" data-testid="approve-blocked">
          <p className="strong">{t('recommendation.blockedTitle')}</p>
          <ul className="plain-list">
            {blocked.map((id) => {
              const item = ruleLabel(detail, id);
              return (
                <li key={id}>
                  <span className="rule-id">{id}</span>
                  {item ? `${msg(item.label)}: ${msg(item.detail)}` : null}
                </li>
              );
            })}
          </ul>
          <p>{t('recommendation.blockedHelp')}</p>
        </div>
      )}
      <fieldset className="radios">
        <legend>{t('recommendation.decision')}</legend>
        {options.map((o) => (
          <label key={o.value} className={o.disabled ? 'radio disabled' : 'radio'}>
            <input type="radio" name="decision" value={o.value} checked={decision === o.value} disabled={o.disabled} onChange={() => setDecision(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      {needsReason ? (
        <TextAreaField
          label={t('recommendation.reasonLabel')}
          hint={t('recommendation.reasonHint')}
          required
          value={reason}
          maxLength={2000}
          error={fieldError}
          onChange={(e) => setReason(e.target.value)}
        />
      ) : null}
      <FormError error={decide.error} />
      <div>
        <Button variant={decision === 'DECLINE' ? 'danger' : 'primary'} onClick={go} loading={decide.isPending} disabled={decision === 'APPROVE' && blocked.length > 0}>
          {t(`recommendation.button.${decision}`)}
        </Button>
      </div>
      <p className="sub">{t('recommendation.logged')}</p>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => decide.mutate()}
        title={t(`recommendation.confirmTitle.${decision}`)}
        confirmLabel={t(`recommendation.button.${decision}`)}
        danger={decision === 'DECLINE'}
        busy={decide.isPending}
        error={decide.error}
      >
        <p>{t(`recommendation.confirmBody.${decision}`, { name: detail.candidate.name })}</p>
      </ConfirmDialog>
    </section>
  );
}

// ───────────── Committee: the guru's office answer ─────────────

export function GuruResponsePanel({ detail, onChanged }: PanelProps) {
  const { t } = useT();
  const toast = useToast();
  const [response, setResponse] = useState<GuruResponseType>('ACCEPTED');
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => applicationsApi.recordGuruResponse(detail.applicationId, response, reason.trim() || undefined),
    onSuccess: (d) => {
      setReason('');
      toast.success(t('guruResponse.saved'));
      onChanged(d);
    },
  });
  if (!detail.actions.canRecordGuruResponse) return null;
  return (
    <section className="panel plain" aria-labelledby="gr-h">
      <h3 id="gr-h">{t('guruResponse.title')}</h3>
      <p className="sub">{t('guruResponse.intro')}</p>
      <SelectField label={t('guruResponse.label')} value={response} onChange={(e) => setResponse(e.target.value as GuruResponseType)}>
        <option value="ACCEPTED">{t('guruResponse.ACCEPTED')}</option>
        <option value="WAIT">{t('guruResponse.WAIT')}</option>
        <option value="DECLINED">{t('guruResponse.DECLINED')}</option>
      </SelectField>
      {response !== 'ACCEPTED' ? (
        <TextAreaField label={t('guruResponse.reason')} required value={reason} maxLength={2000} error={fieldError} onChange={(e) => setReason(e.target.value)} />
      ) : null}
      <FormError error={save.error} />
      <div>
        <Button
          variant="primary"
          loading={save.isPending}
          onClick={() => {
            if (!recordGuruResponseBody.safeParse({ response, reason: reason.trim() || undefined }).success) {
              setFieldError(t('guruResponse.reasonRequired'));
              return;
            }
            setFieldError(null);
            save.mutate();
          }}
        >
          {t('guruResponse.save')}
        </Button>
      </div>
    </section>
  );
}

// ───────────── Letter and candidate package ─────────────

export function HandoffPanel({ detail }: PanelProps) {
  const { t, tc, msg, dateTime } = useT();
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const approved = detail.latestRecommendation?.decision === 'APPROVE';
  const showLetter = approved && can('recommendation:letter');
  const preview = useQuery({
    queryKey: ['package-preview', detail.applicationId],
    queryFn: () => applicationsApi.packagePreview(detail.applicationId),
    enabled: open,
    gcTime: 0,
  });
  const download = useMutation({
    mutationFn: () => applicationsApi.downloadPackage(detail.applicationId),
    onSuccess: (file) => {
      saveBlob(file);
      setOpen(false);
    },
  });
  if (!showLetter && !detail.actions.canExportPackage) return null;
  return (
    <section className="panel plain" aria-labelledby="handoff-h">
      <h3 id="handoff-h">{t('handoff.title')}</h3>
      {showLetter ? (
        <FileLink href={applicationsApi.letterUrl(detail.applicationId)} target="_blank" rel="noopener noreferrer">
          {t('handoff.letter')}
        </FileLink>
      ) : null}
      {detail.actions.canExportPackage ? (
        <div>
          <Button onClick={() => setOpen(true)}>{t('handoff.package')}</Button>
          <p className="sub">{t('handoff.packageHint')}</p>
        </div>
      ) : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('handoff.previewTitle')}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => download.mutate()} loading={download.isPending} disabled={preview.isPending || preview.isError}>
              {t('handoff.download')}
            </Button>
          </>
        }
      >
        <div className="stack">
          {preview.isPending ? <p>{t('common.loading')}</p> : null}
          <FormError error={preview.error ?? download.error} />
          {preview.data ? (
            <>
              <h3>{t('handoff.missingDocs')}</h3>
              {preview.data.missingDocuments.length === 0 ? (
                <p className="muted">{t('handoff.nothingMissing')}</p>
              ) : (
                <ul className="plain-list" data-testid="package-missing-docs">
                  {preview.data.missingDocuments.map((d) => (
                    <li key={d}>
                      <StatusBadge status="NOT_MET" label={t('documents.missing')} /> {tc(`docType.${d}`)}
                    </li>
                  ))}
                </ul>
              )}
              <h3>{t('handoff.unmetItems')}</h3>
              {preview.data.unmetItems.length === 0 ? (
                <p className="muted">{t('handoff.nothingUnmet')}</p>
              ) : (
                <ul className="plain-list" data-testid="package-unmet">
                  {preview.data.unmetItems.map((id) => {
                    const item = ruleLabel(detail, id);
                    return (
                      <li key={id}>
                        <span className="rule-id">{id}</span>
                        {item ? msg(item.label) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="sub">{t('handoff.logged', { when: dateTime(preview.data.generatedAt) })}</p>
            </>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
}

// ───────────── Read-only status summary ─────────────

export function StatusSummary({ detail }: { detail: ApplicationDetail }) {
  const { t, tc, dateTime } = useT();
  const rec = detail.latestRecommendation;
  const gr = detail.latestGuruResponse;
  return (
    <section className="panel plain" aria-labelledby="status-h">
      <h3 id="status-h">{t('status.title')}</h3>
      <div className="row">
        <Chip>{tc(`stage.${detail.stage}`)}</Chip>
        <Chip tone={detail.status === 'OPEN' ? 'plain' : 'amber'}>{tc(`appStatus.${detail.status}`)}</Chip>
      </div>
      {rec ? (
        <p data-testid="latest-recommendation">
          <b>{t(`recommendation.latest.${rec.decision}`)}</b>
          <br />
          <span className="sub">
            {rec.decidedBy} · {dateTime(rec.decidedAt)} · {t('status.ruleVersion', { label: `${rec.ruleVersion.ruleSetName} v${rec.ruleVersion.version}` })}
          </span>
          {rec.reason ? <span className="block">{rec.reason}</span> : null}
        </p>
      ) : (
        <p className="muted">{t('status.noRecommendation')}</p>
      )}
      {gr ? (
        <p data-testid="latest-guru-response">
          <b>{t(`guruResponse.latest.${gr.response}`)}</b>
          <br />
          <span className="sub">
            {gr.recordedBy} · {dateTime(gr.recordedAt)}
          </span>
          {gr.reason ? <span className="block">{gr.reason}</span> : null}
        </p>
      ) : null}
    </section>
  );
}
