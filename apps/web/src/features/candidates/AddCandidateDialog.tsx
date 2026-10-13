'use client';

import { CONSENT_VERSION, createCandidateBody } from '@iskcon/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, CheckboxField, Dialog, FormError, SelectField, TextField, useToast } from '@/components/ui';
import { useT } from '@/i18n/provider';
import { candidatesApi, isApiError, peopleApi } from '@/lib/api';
import { TRACKS } from '@/lib/enums';
import { useFieldErrorText } from '@/lib/use-error-text';

interface FormState {
  name: string;
  phone: string;
  email: string;
  groupName: string;
  mentorId: string;
  guruId: string;
  track: 'FIRST' | 'SECOND';
  consent: boolean;
  createLogin: boolean;
}

const EMPTY: FormState = { name: '', phone: '', email: '', groupName: '', mentorId: '', guruId: '', track: 'FIRST', consent: false, createLogin: true };

/** Field error key per contract path. `LOGIN_NEEDS_CONTACT` is attached to phone by the contract. */
type Errors = Partial<Record<keyof FormState, string>>;

export function AddCandidateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, tc } = useT();
  const fieldText = useFieldErrorText();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const mentors = useQuery({ queryKey: ['mentors'], queryFn: peopleApi.mentors, enabled: open });
  const gurus = useQuery({ queryKey: ['gurus'], queryFn: peopleApi.gurus, enabled: open });

  const create = useMutation({
    mutationFn: () =>
      candidatesApi.create({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        groupName: form.groupName.trim() || undefined,
        mentorId: form.mentorId || undefined,
        guruId: form.guruId || undefined,
        track: form.track,
        createLogin: form.createLogin,
        consent: { accepted: true, version: CONSENT_VERSION },
      }),
    onSuccess: (r) => {
      toast.success(t('addCandidate.done'));
      void qc.invalidateQueries({ queryKey: ['candidates'] });
      setForm(EMPTY);
      onClose();
      router.push(`/candidates/${r.applicationId}`);
    },
    onError: (e) => {
      if (isApiError(e)) {
        const next: Errors = {};
        for (const fe of e.errors) {
          const key = fe.path.split('.')[0] as keyof FormState;
          if (key in EMPTY) next[key] = fieldText(fe);
        }
        setErrors(next);
      }
    },
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    const next: Errors = {};
    if (!form.consent) next.consent = t('addCandidate.consentRequired');
    const parsed = createCandidateBody.safeParse({
      name: form.name,
      phone: form.phone || undefined,
      email: form.email || undefined,
      groupName: form.groupName || undefined,
      mentorId: form.mentorId || undefined,
      guruId: form.guruId || undefined,
      track: form.track,
      createLogin: form.createLogin,
      consent: { accepted: true, version: CONSENT_VERSION },
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof FormState;
        if (!(key in EMPTY)) continue;
        next[key] =
          issue.message === 'LOGIN_NEEDS_CONTACT'
            ? t('addCandidate.loginNeedsContact')
            : key === 'name'
              ? t('addCandidate.nameRequired')
              : key === 'email'
                ? t('addCandidate.emailInvalid')
                : t('error.field.INVALID');
      }
    }
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('addCandidate.title')}
      wide
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={create.isPending}>
            {t('addCandidate.submit')}
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
        <div className="grid2">
          <TextField label={t('addCandidate.name')} required value={form.name} error={errors.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
          <TextField label={t('addCandidate.group')} hint={t('addCandidate.groupHint')} value={form.groupName} onChange={(e) => set('groupName', e.target.value)} />
          <TextField label={t('addCandidate.phone')} type="tel" inputMode="tel" value={form.phone} error={errors.phone} onChange={(e) => set('phone', e.target.value)} />
          <TextField label={t('addCandidate.email')} type="email" inputMode="email" value={form.email} error={errors.email} onChange={(e) => set('email', e.target.value)} />
          <SelectField label={t('addCandidate.mentor')} value={form.mentorId} error={errors.mentorId} onChange={(e) => set('mentorId', e.target.value)}>
            <option value="">{t('addCandidate.noneYet')}</option>
            {(mentors.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
          <SelectField label={t('addCandidate.guru')} hint={t('addCandidate.guruHint')} value={form.guruId} error={errors.guruId} onChange={(e) => set('guruId', e.target.value)}>
            <option value="">{t('addCandidate.noneYet')}</option>
            {(gurus.data ?? []).filter((g) => g.active).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </SelectField>
          <SelectField label={t('addCandidate.track')} value={form.track} onChange={(e) => set('track', e.target.value === 'SECOND' ? 'SECOND' : 'FIRST')}>
            {TRACKS.map((tr) => (
              <option key={tr} value={tr}>
                {tc(`track.${tr}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <CheckboxField label={t('addCandidate.createLogin')} hint={t('addCandidate.createLoginHint')} checked={form.createLogin} onChange={(e) => set('createLogin', e.target.checked)} />
        <fieldset className="consent">
          <legend>{t('addCandidate.consentTitle')}</legend>
          <p>{t('addCandidate.consentText')}</p>
          <p className="sub">{t('addCandidate.consentVersion', { version: CONSENT_VERSION })}</p>
          <CheckboxField label={t('addCandidate.consentCheck')} checked={form.consent} error={errors.consent} onChange={(e) => set('consent', e.target.checked)} />
        </fieldset>
        <FormError error={create.error} />
      </form>
    </Dialog>
  );
}
