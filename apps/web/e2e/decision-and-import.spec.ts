import { expect, test, type BrowserContext } from '@playwright/test';
import { join } from 'node:path';
import { sessionFor, SHOTS, type UserKey } from './helpers';

/**
 * The president's decision (with the authenticator step), the guru's office answer, the spreadsheet import,
 * and the sign-in form used by keyboard alone. All against the real API.
 */
test.describe.configure({ mode: 'serial' });

const contexts: BrowserContext[] = [];
async function open(browser: Parameters<Parameters<typeof test>[2]>[0]['browser'], who: UserKey, size?: { width: number; height: number }) {
  const ctx = await sessionFor(browser, who, size);
  contexts.push(ctx);
  return ctx.newPage();
}
test.afterAll(async () => {
  for (const c of contexts) await c.close().catch(() => undefined);
});

test('the president recommends a file whose rules are all met, and the committee records the guru answer', async ({ browser }) => {
  const president = await open(browser, 'president');
  await president.goto('/queue');
  await president.getByRole('link', { name: 'Sunita Roy', exact: true }).click();
  await expect(president.getByRole('heading', { name: 'Sunita Roy', level: 1 })).toBeVisible();
  await expect(president.getByTestId('approve-blocked')).toHaveCount(0);
  await president.getByRole('radio', { name: /Recommend and generate the letter/ }).check();
  await president.getByRole('button', { name: 'Recommend and generate letter' }).click();
  const confirm = president.locator('dialog[open]');
  await expect(confirm.getByRole('heading', { name: 'Recommend this candidate?' })).toBeVisible();
  await confirm.getByRole('button', { name: 'Recommend and generate letter' }).click();
  await expect(president.getByText('Recommended. The letter is ready.')).toBeVisible();
  await expect(president.getByText('Recommended by the president')).toBeVisible();
  await president.screenshot({ path: `${SHOTS}/live-recommended-1280.png`, fullPage: true });

  const committee = await open(browser, 'committee');
  await committee.goto('/candidates');
  await committee.getByRole('link', { name: 'Sunita Roy', exact: true }).click();
  await expect(committee.getByRole('heading', { name: "The guru's office answer" })).toBeVisible();
  await committee.getByRole('combobox', { name: 'Answer' }).selectOption('WAIT');
  await committee.getByRole('button', { name: 'Record answer' }).click();
  await expect(committee.getByText('A reason is needed when the answer is wait or declined.')).toBeVisible();
  // Accepting needs no reason; the file stays with the president's recommendation and the guru's answer shows.
  await committee.getByRole('combobox', { name: 'Answer' }).selectOption('ACCEPTED');
  await committee.getByRole('button', { name: 'Record answer' }).click();
  await expect(committee.getByText('Answer recorded.')).toBeVisible();
  await expect(committee.getByText("Guru's office: accepted")).toBeVisible();
});

test('the administrator checks a spreadsheet, sees row messages, and imports the good rows after confirming consent', async ({ browser }) => {
  const page = await open(browser, 'admin');
  await page.goto('/import');
  await page.getByLabel('Spreadsheet file (.csv or .xlsx)').setInputFiles(join(__dirname, 'fixtures', 'aspirants.csv'));
  await page.getByRole('button', { name: 'Check the file' }).click();
  const totals = page.getByTestId('import-totals');
  // The fixture is built to hit every kind of row: good, warned, and refused.
  await expect(totals).toContainText('12 rows');
  await expect(totals).toContainText('3 ready');
  await expect(totals).toContainText('2 with warnings');
  await expect(totals).toContainText('7 with errors');
  await expect(page.getByText('The email address is not valid.')).toBeVisible();
  const commit = page.getByRole('button', { name: 'Import 5 rows' });
  await expect(commit).toBeDisabled();
  await page.getByLabel(/Each person in this file has been told/).check();
  await expect(commit).toBeEnabled();
  await commit.click();
  const done = page.getByTestId('import-done');
  await expect(done).toContainText('Import finished');
  await expect(done).toContainText('5 candidates were added. 7 rows were skipped.');
  await page.screenshot({ path: `${SHOTS}/live-import-done-1280.png`, fullPage: true });
  await page.goto('/candidates');
  await expect(page.getByRole('link', { name: 'हिमांशु शर्मा', exact: true })).toBeVisible();
});

test('the sign-in form works with the keyboard alone', async ({ page }) => {
  await page.goto('/login');
  // A skip link and the language switcher come first; the form must be reachable within a few presses.
  const field = page.getByLabel('Email or phone number');
  for (let i = 0; i < 8 && !(await field.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await page.keyboard.type('nobody@example.org');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/If this matches a person known to the temple/)).toBeVisible();
  // The code field is reachable next, and Enter submits it.
  await page.getByLabel('6-digit code').focus();
  await page.keyboard.type('000000');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').first()).toBeVisible();
});

test('major screens switch to Bengali and Hindi with no English headings left behind', async ({ browser }) => {
  const page = await open(browser, 'committee');
  for (const [lang, probe] of [['bn', /প্রার্থী|আবেদন/], ['hi', /उम्मीदवार|आवेदन/]] as const) {
    await page.context().addCookies([{ name: 'lang', value: lang, url: 'http://localhost:3000' }]);
    for (const path of ['/candidates', '/ceremonies', '/register', '/notifications']) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      const heading = (await page.locator('main h1').first().textContent()) ?? '';
      expect(heading, `${path} heading in ${lang}`).toMatch(/[^\u0000-\u007f]/);
    }
    await page.goto('/candidates');
    await expect(page.locator('body')).toContainText(probe);
  }
});
