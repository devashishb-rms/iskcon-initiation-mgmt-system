'use client';

import type { Locale } from '@iskcon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { I18nProvider } from '@/i18n/provider';
import { isApiError, peopleApi } from '@/lib/api';

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // A refused or missing request will not succeed on retry; only transient failures do.
        retry: (count, error) => (!isApiError(error) || error.status === 0 || error.status >= 500) && count < 2,
      },
    },
  });
}

export function AppProviders({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [client] = useState(makeClient);
  const onLocaleChange = useCallback((l: Locale) => {
    // Cookie is the source of truth in the browser; the API copy is best effort (see CONTRACT_REQUESTS.md).
    void peopleApi.updateMyLocale(l).catch(() => undefined);
  }, []);
  return (
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale={initialLocale} onLocaleChange={onLocaleChange}>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
