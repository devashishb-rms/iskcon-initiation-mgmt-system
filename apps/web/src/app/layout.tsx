import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { LOCALE_COOKIE, parseLocale } from '@/lib/locale-cookie';
import { AppProviders } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Initiation office · ISKCON Newtown', template: '%s · ISKCON Newtown' },
  description: 'Initiation management for ISKCON Newtown, Kolkata.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#16213A' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers makes every page dynamic, which lets Next stamp the CSP nonce on its scripts.
  await headers();
  const jar = await cookies();
  const locale = parseLocale(jar.get(LOCALE_COOKIE)?.value) ?? 'en';
  return (
    <html lang={locale}>
      <body>
        <AppProviders initialLocale={locale}>{children}</AppProviders>
      </body>
    </html>
  );
}
