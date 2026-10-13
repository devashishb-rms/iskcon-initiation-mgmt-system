'use client';

import { homeFor, verifyMfaBody } from '@iskcon/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, FormError, Spinner, TextField } from '@/components/ui';
import { SignOutButton } from '@/components/layout/SignOut';
import { useT } from '@/i18n/provider';
import { authApi } from '@/lib/api';
import { QrCode } from './QrCode';
import { SESSION_KEY, useSessionQuery } from './session';

export function MfaForm() {
  const { t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const sessionQuery = useSessionQuery();
  const session = sessionQuery.data;
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const enrol = useMutation({ mutationFn: authApi.mfaEnrol });
  const confirm = useMutation({
    mutationFn: (c: string) => (session?.mfa.enrolled ? authApi.mfaVerify(c) : authApi.mfaConfirmEnrol(c)),
    onSuccess: (s) => {
      qc.setQueryData(SESSION_KEY, s);
      router.replace(homeFor(s.user.roles));
    },
  });

  // Nothing to do for a role without a second factor, or once it is proven.
  useEffect(() => {
    if (session && (!session.mfa.required || session.mfa.verified)) router.replace(homeFor(session.user.roles));
  }, [session, router]);

  if (sessionQuery.isPending) return <Spinner />;
  if (!session) return <FormError error={sessionQuery.error} />;

  const enrolled = session.mfa.enrolled;
  const secret = enrol.data;

  function submit(e: FormEvent) {
    e.preventDefault();
    setFieldError(null);
    if (!verifyMfaBody.safeParse({ code }).success) {
      setFieldError(t('mfa.codeInvalid'));
      return;
    }
    confirm.mutate(code);
  }

  const codeForm = (
    <form onSubmit={submit} className="stack" noValidate>
      <TextField
        label={t('mfa.code')}
        hint={t('mfa.codeHint')}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        error={fieldError}
        className="code-input"
      />
      <FormError error={confirm.error} />
      <Button type="submit" variant="primary" loading={confirm.isPending}>
        {enrolled ? t('mfa.verify') : t('mfa.confirmEnrol')}
      </Button>
    </form>
  );

  return (
    <div className="stack">
      {enrolled ? (
        <>
          <p>{t('mfa.verifyIntro')}</p>
          {codeForm}
          <p className="sub">{t('mfa.lostDevice')}</p>
        </>
      ) : !secret ? (
        <>
          <p>{t('mfa.enrolIntro')}</p>
          <FormError error={enrol.error} />
          <Button variant="primary" onClick={() => enrol.mutate()} loading={enrol.isPending}>
            {t('mfa.start')}
          </Button>
        </>
      ) : (
        <>
          <ol className="steps">
            <li>{t('mfa.step1')}</li>
            <li>
              {t('mfa.step2')}
              <div className="qr-box">
                <QrCode value={secret.otpauthUrl} alt={t('mfa.qrAlt')} />
              </div>
              <details>
                <summary>{t('mfa.cannotScan')}</summary>
                <p className="sub">{t('mfa.manualKey')}</p>
                <code className="secret" data-testid="mfa-secret">
                  {secret.secret}
                </code>
              </details>
            </li>
            <li>{t('mfa.step3')}</li>
          </ol>
          {codeForm}
        </>
      )}
      <div>
        <SignOutButton className="link" />
      </div>
    </div>
  );
}
