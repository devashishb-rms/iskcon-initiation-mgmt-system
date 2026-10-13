import type { ReactNode } from 'react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Brand } from './StaffShell';

export function AuthCard({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <main className="auth-card" id="main">
        <div className="row between">
          <Brand />
          <LanguageSwitcher />
        </div>
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
        {children}
      </main>
    </div>
  );
}
