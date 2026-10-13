import { test, expect } from '@playwright/test';
import { sessionFor, SHOTS } from './helpers';

test('committee signs in with a code and lands on candidates', async ({ browser }) => {
  const ctx = await sessionFor(browser, 'committee');
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/\/candidates$/);
  await expect(page.getByRole('heading', { name: 'Candidates', level: 1 })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tmp-committee.png`, fullPage: true });
});
