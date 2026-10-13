import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { totp } from './totp';

/** The API prints sign-in codes to its log (DELIVERY_MODE=console). */
export const BASE = process.env.WEB_URL ?? 'http://localhost:3000';
const API_LOG = process.env.API_LOG ?? '/tmp/api.log';
const STATE_DIR = process.env.E2E_STATE_DIR ?? join(__dirname, '.state');
const SECRETS = join(STATE_DIR, 'totp.json');

export const USERS = {
  president: 'president@example.org',
  admin: 'admin@example.org',
  committee: 'committee@example.org',
  mohan: 'mohan@example.org',
  kalyan: 'kalyan@example.org',
  ananya: 'ananya@example.org',
  priya: 'priya@example.org',
  rahul: 'rahul@example.org',
  debashis: 'debashis@example.org',
  sunita: 'sunita@example.org',
} as const;
export type UserKey = keyof typeof USERS;

mkdirSync(STATE_DIR, { recursive: true });

function secrets(): Record<string, string> {
  return existsSync(SECRETS) ? (JSON.parse(readFileSync(SECRETS, 'utf8')) as Record<string, string>) : {};
}

function readCode(identifier: string, afterOffset: number): string | null {
  if (!existsSync(API_LOG)) return null;
  const text = readFileSync(API_LOG, 'utf8').slice(afterOffset);
  const re = new RegExp(`to ${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: [^\\n]*\\n(\\d{6}) is your`, 'g');
  let last: string | null = null;
  for (const m of text.matchAll(re)) last = m[1] ?? null;
  return last;
}

export async function waitForCode(identifier: string, afterOffset: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const c = readCode(identifier, afterOffset);
    if (c) return c;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No sign-in code for ${identifier} appeared in ${API_LOG}`);
}

export const logSize = (): number => (existsSync(API_LOG) ? readFileSync(API_LOG, 'utf8').length : 0);

/** Drives the real sign-in screens (code, then the authenticator step for the president and administrators). */
export async function signIn(page: Page, who: UserKey): Promise<void> {
  const identifier = USERS[who];
  await page.goto('/login');
  const offset = logSize();
  await page.getByLabel('Email or phone number').fill(identifier);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  const code = await waitForCode(identifier, offset);
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  if (who === 'president' || who === 'admin') {
    await page.waitForURL('**/mfa');
    const known = secrets()[identifier];
    if (known) {
      await page.getByLabel('Code from the app').fill(totp(known));
      await page.getByRole('button', { name: 'Verify and continue' }).click();
    } else {
      const enrolled = await page.getByText('Enter the 6-digit code from your authenticator app.').isVisible().catch(() => false);
      if (enrolled) throw new Error(`${identifier} already has a second factor but its secret is not in e2e/.state/totp.json`);
      await page.getByRole('button', { name: 'Set up authenticator app' }).click();
      const secret = (await page.getByTestId('mfa-secret').textContent())?.trim();
      if (!secret) throw new Error('No TOTP secret shown');
      writeFileSync(SECRETS, JSON.stringify({ ...secrets(), [identifier]: secret }, null, 2));
      await page.getByLabel('Code from the app').fill(totp(secret));
      await page.getByRole('button', { name: 'Confirm and continue' }).click();
    }
  }
  await page.waitForURL((u) => !['/login', '/mfa'].includes(u.pathname));
}

/** A signed-in browser context; reuses a saved session when it is still valid (sign-in codes are rate limited). */
export async function sessionFor(browser: Browser, who: UserKey, viewport?: { width: number; height: number }): Promise<BrowserContext> {
  const file = join(STATE_DIR, `${who}.json`);
  const opts = viewport ? { viewport } : {};
  if (existsSync(file)) {
    const ctx = await browser.newContext({ storageState: file, baseURL: BASE, ...opts });
    const res = await ctx.request.get('/api/auth/session');
    if (res.ok()) return ctx;
    await ctx.close();
  }
  const ctx = await browser.newContext({ baseURL: BASE, ...opts });
  const page = await ctx.newPage();
  await signIn(page, who);
  await ctx.storageState({ path: file });
  await page.close();
  return ctx;
}

export async function expectNoConsoleErrors(page: Page, ignore: RegExp[] = []): Promise<() => void> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignore.some((r) => r.test(m.text()))) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return () => expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
}

export const SHOTS = join(__dirname, 'screenshots');
