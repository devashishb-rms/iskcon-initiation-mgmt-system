'use client';

import { homeFor, requestOtpBody, verifyOtpBody, type SessionResponse } from '@iskcon/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, FormError, TextField } from '@/components/ui';
import { useT } from '@/i18n/provider';
import { authApi, isApiError } from '@/lib/api';
import { safeInternalPath } from '@/lib/safe-path';
import { useCountdown } from '@/lib/use-countdown';
import { SESSION_KEY } from './session';

export const RESEND_SECONDS = 30;

/** Where to go after a session exists: second factor first when the role needs it. */
export function destinationAfterSignIn(session: SessionResponse, next: string | null): string {
  if (session.mfa.required && !session.mfa.verified) return '/mfa';
  return safeInternalPath(next) ?? homeFor(session.user.roles);
}

export function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<'identifier' | 'code'>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const cooldown = useCountdown();

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setFieldError(null);
    if (!requestOtpBody.safeParse({ identifier }).success) {
      setFieldError(t('login.identifierInvalid'));
      return;
    }
    setBusy(true);
    try {
      await authApi.requestCode(identifier.trim());
      setStep('code');
      setCode('');
      cooldown.start(RESEND_SECONDS);
    } catch (err) {
      setError(err);
      if (isApiError(err) && err.code === 'RATE_LIMITED') cooldown.start(RESEND_SECONDS * 2);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (!verifyOtpBody.safeParse({ identifier, code }).success) {
      setFieldError(t('login.codeInvalid'));
      return;
    }
    setBusy(true);
    try {
      const session = await authApi.verifyCode(identifier.trim(), code);
      qc.setQueryData(SESSION_KEY, session);
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(destinationAfterSignIn(session, next));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  if (step === 'identifier') {
    return (
      <form onSubmit={requestCode} className="stack" noValidate>
        <TextField
          label={t('login.identifier')}
          hint={t('login.identifierHint')}
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={fieldError}
        />
        <FormError error={error} />
        <Button type="submit" variant="primary" loading={busy} disabled={cooldown.left > 0 && !!error}>
          {t('login.sendCode')}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="stack" noValidate>
      <p role="status" className="note-box info">
        {t('login.codeSent')}
      </p>
      <TextField
        label={t('login.code')}
        hint={t('login.codeHint')}
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        error={fieldError}
        className="code-input"
      />
      <FormError error={error} />
      <Button type="submit" variant="primary" loading={busy}>
        {t('login.signIn')}
      </Button>
      <div className="row between">
        <Button onClick={() => requestCode()} disabled={cooldown.left > 0 || busy}>
          {cooldown.left > 0 ? t('login.resendIn', { seconds: cooldown.left }) : t('login.resend')}
        </Button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setStep('identifier');
            setError(null);
            setFieldError(null);
          }}
        >
          {t('login.changeIdentifier')}
        </button>
      </div>
    </form>
  );
}
