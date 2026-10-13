import type { Locale, SessionResponse } from '@iskcon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { makeSession, SessionProvider } from '@/features/auth/session';
import { I18nProvider } from '@/i18n/provider';

export const sessionFor = (roles: SessionResponse['user']['roles']): SessionResponse =>
  ({
    user: { id: 'u1', name: 'Test User', roles, locale: 'en', email: null, phone: null },
    tenant: { name: 'ISKCON Newtown', timezone: 'Asia/Kolkata' },
    mfa: { required: false, verified: false, enrolled: false },
  }) as unknown as SessionResponse;

export interface Options extends Omit<RenderOptions, 'wrapper'> {
  locale?: Locale;
  roles?: SessionResponse['user']['roles'];
}

/** Renders with the same providers as the app: language, query cache, toasts and a session. */
export function renderApp(ui: ReactElement, { locale = 'en', roles = ['COMMITTEE'], ...rest }: Options = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale={locale}>
        <SessionProvider value={makeSession(sessionFor(roles))}>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
  return { client, ...render(ui, { wrapper: Wrapper, ...rest }) };
}
