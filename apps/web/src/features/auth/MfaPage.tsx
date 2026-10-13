'use client';

import { AuthCard } from '@/components/layout/AuthCard';
import { useT } from '@/i18n/provider';
import { MfaForm } from './MfaForm';

export function MfaPage() {
  const { t } = useT();
  return (
    <AuthCard title={t('mfa.title')} lead={t('mfa.lead')}>
      <MfaForm />
    </AuthCard>
  );
}
