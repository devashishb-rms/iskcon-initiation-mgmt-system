'use client';

import { can as canDo, type Permission, type Role, type SessionResponse } from '@iskcon/contracts';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { authApi } from '@/lib/api';
import { FormError } from '@/components/ui/FormError';

export const SESSION_KEY = ['session'] as const;

export function useSessionQuery() {
  return useQuery({ queryKey: SESSION_KEY, queryFn: authApi.session, staleTime: 60_000, retry: false });
}

export interface SessionValue {
  user: SessionResponse['user'];
  tenant: SessionResponse['tenant'];
  mfa: SessionResponse['mfa'];
  roles: readonly Role[];
  /** Hides or shows UI only; the server decides what is actually allowed. */
  can: (permission: Permission) => boolean;
}

const Ctx = createContext<SessionValue | null>(null);

export const makeSession = (s: SessionResponse): SessionValue => ({
  user: s.user,
  tenant: s.tenant,
  mfa: s.mfa,
  roles: s.user.roles,
  can: (p) => canDo(s.user.roles, p),
});

export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Loads the session and provides it. Shows a spinner while loading; a 401 redirects to /login in the API core. */
export function SessionLoader({ children }: { children: (session: SessionValue) => ReactNode }) {
  const q = useSessionQuery();
  const value = useMemo(() => (q.data ? makeSession(q.data) : null), [q.data]);
  if (q.isPending) return <Spinner />;
  if (q.isError || !value) return <FormError error={q.error} />;
  return <SessionProvider value={value}>{children(value)}</SessionProvider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside <SessionProvider>');
  return v;
}
