import { expect, test } from '@playwright/test';
import { expectNoConsoleErrors, sessionFor, SHOTS } from './helpers';

test.describe('candidate (live API)', () => {
  test('My path shows the stage, one next step, and a checklist where unknown is not a failure', async ({ browser }) => {
    const ctx = await sessionFor(browser, 'ananya');
    const page = await ctx.newPage();
    // The running API build has no /notifications yet, so the bell's request may 404.
    const done = await expectNoConsoleErrors(page, [/status of 404/]);
    await page.goto('/path');
    await expect(page.getByRole('heading', { name: 'Hare Krishna, Ananya', level: 1 })).toBeVisible();
    await expect(page.getByText('Your path to first initiation')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Stages of the path' })).toBeVisible();
    await expect(page.getByTestId('next-step')).not.toBeEmpty();
    // A candidate sees the phone shell: no staff navigation.
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.getByText('Needs confirming means nobody has checked it yet. It is not a fail.')).toBeVisible();
    // Candidates cannot reach staff pages: they are sent back to their own page.
    await page.goto('/queue');
    await expect(page.getByText('This page is not for your role')).toBeVisible();
    await page.getByRole('link', { name: 'Go to my page' }).click();
    await expect(page).toHaveURL(/\/path$/);
    await done();
    await ctx.close();
  });

  test('My path works on a phone and in Hindi', async ({ browser }) => {
    const ctx = await sessionFor(browser, 'ananya', { width: 390, height: 844 });
    const page = await ctx.newPage();
    await page.goto('/path');
    await page.getByRole('button', { name: 'हिन्दी' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('हरे कृष्ण');
    await expect(page.getByText('पुष्टि बाकी').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'English' }).click();
    await ctx.close();
  });
});

test.describe('administrator: rule sets (live API)', () => {
  test('a value below the GBC minimum is refused with a message beside the field, and nothing is saved', async ({ browser }) => {
    const ctx = await sessionFor(browser, 'admin');
    const page = await ctx.newPage();
    await page.goto('/rules');
    await expect(page.getByRole('heading', { name: 'Rule sets', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Temple baseline', level: 2 })).toBeVisible();

    const months = page.getByLabel(/Months following the practice standard/);
    await expect(page.locator('[data-floor="practiceMonths"]')).toContainText('GBC minimum: 12');
    const original = await months.inputValue();
    await months.fill('6');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Must be at least 12 (you entered 6).')).toBeVisible();
    await expect(page.getByText('Some values are below the minimum. See the messages beside each field.')).toBeVisible();
    await expect(months).toHaveAttribute('aria-invalid', 'true');

    // A fraction is refused too.
    await months.fill('12.5');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Enter a whole number of months.')).toBeVisible();

    // The required switches cannot be turned off.
    await months.fill(original);
    await page.getByLabel(/The examination is required/).uncheck();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('This rule is required and cannot be switched off.')).toBeVisible();
    await ctx.close();
  });

  test('a guru rule set cannot go below the temple baseline', async ({ browser }) => {
    const ctx = await sessionFor(browser, 'admin');
    const page = await ctx.newPage();
    await page.goto('/rules');
    const guruEntry = page.getByRole('list', { name: 'Rule sets' }).getByRole('button').nth(1);
    await guruEntry.click();
    await expect(page.locator('[data-floor="shelterMonths"]')).toBeVisible();
    await expect(page.getByText(/Temple baseline: \d+ \(minimum for this set\)/).first()).toBeVisible();
    const field = page.getByLabel(/Months in shelter before applying/);
    await field.fill('1');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText(/Must be at least \d+ \(you entered 1\)\./)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/live-rules-floor-1280.png`, fullPage: true });
    await ctx.close();
  });
});
