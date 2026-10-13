'use client';

import { AuthCard } from '@/components/layout/AuthCard';
import { useT } from '@/i18n/provider';
import { LoginForm } from './LoginForm';

export function LoginPage() {
  const { t } = useT();
  return (
    <AuthCard title={t('login.title')} lead={t('login.lead')}>
      <LoginForm />
    </AuthCard>
  );
}
