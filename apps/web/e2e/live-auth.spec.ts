import { expect, test } from '@playwright/test';
import { BASE, expectNoConsoleErrors, logSize, sessionFor, USERS, waitForCode } from './helpers';

test.describe('sign-in (live API)', () => {
  test('a visitor without a session is sent to sign-in and returns to the page they wanted', async ({ page }) => {
    await page.goto('/queue');
    await expect(page).toHaveURL(/\/login\?next=%2Fqueue/);
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  });

  test('a wrong code shows a translated message and keeps the person on the page', async ({ page }) => {
    const done = await expectNoConsoleErrors(page, [/401|Unauthorized/]);
    await page.goto('/login');
    const offset = logSize();
    await page.getByLabel('Email or phone number').fill(USERS.priya);
    await page.getByRole('button', { name: 'Send me a code' }).click();
    const real = await waitForCode(USERS.priya, offset);
    const wrong = real === '000000' ? '111111' : '000000';
    await page.getByLabel('6-digit code').fill(wrong);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('[role=alert][data-code]')).toContainText('That code is not correct or is no longer valid');
    await expect(page).toHaveURL(/\/login/);
    await done();
  });

  test('an unknown email gets the same answer as a known one (no account guessing)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or phone number').fill('nobody-here@example.org');
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await expect(page.getByText(/If this matches a person known to the temple/)).toBeVisible();
  });

  test('sign-in with a code lands each role on its own home, and sign-out ends the session', async ({ browser }) => {
    const ctx = await sessionFor(browser, 'ananya');
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/path$/);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    const res = await ctx.request.get('/api/auth/session');
    expect(res.status()).toBe(401);
    await ctx.close();
    // The session was destroyed on the server: refresh the saved state for the other specs.
    const again = await sessionFor(browser, 'ananya');
    await again.storageState({ path: `${process.env.E2E_STATE_DIR ?? __dirname + '/.state'}/ananya.json` });
    await again.close();
  });

  test('the language choice is remembered and the page switches to Bengali', async ({ browser }) => {
    const ctx = await sessionFor(browser, 'committee');
    const page = await ctx.newPage();
    await page.goto('/candidates');
    await page.getByRole('button', { name: 'বাংলা' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('প্রার্থীগণ');
    await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('প্রার্থীগণ');
    const cookies = await ctx.cookies(BASE);
    expect(cookies.find((c) => c.name === 'lang')?.value).toBe('bn');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Candidates');
    await ctx.close();
  });
});
