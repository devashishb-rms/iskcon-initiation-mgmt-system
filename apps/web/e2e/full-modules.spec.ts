import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { sessionFor, SHOTS, type UserKey } from './helpers';

/**
 * Screens whose API modules arrived after the first API build: documents, recommendations,
 * ceremonies, register, notifications, imports. Each test skips itself when the API it talks to does
 * not have the module yet (the mocked specs cover those screens in that case).
 */
test.describe.configure({ mode: 'serial' });

const contexts: BrowserContext[] = [];
async function open(browser: Parameters<Parameters<typeof test>[2]>[0]['browser'], who: UserKey, size?: { width: number; height: number }): Promise<Page> {
  const ctx = await sessionFor(browser, who, size);
  contexts.push(ctx);
  return ctx.newPage();
}
test.afterAll(async () => {
  for (const c of contexts) await c.close().catch(() => undefined);
});

async function requireModule(page: Page, path: string): Promise<void> {
  const res = await page.context().request.get(`/api${path}`);
  test.skip(res.status() === 404, `The API at hand has no ${path} yet`);
}

/** Today in the temple's time zone: a ceremony can only be completed on or after its date. */
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const TODAY_SHORT = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
const STAMP = Date.now().toString(36);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

test('a candidate adds a document from My path, sees it on file, and can remove it', async ({ browser }) => {
  const page = await open(browser, 'ananya', { width: 390, height: 844 });
  await page.goto('/path');
  await requireModule(page, '/me/path');
  await page.getByRole('tab', { name: 'Documents' }).click();
  await page.getByLabel('What is it?').selectOption('COURSE_CERTIFICATE');
  await page.getByTestId('file-input').setInputFiles({ name: `certificate-${STAMP}.pdf`, mimeType: 'application/pdf', buffer: PDF });
  await expect(page.getByText('Document uploaded.')).toBeVisible();
  const item = page.locator('li', { hasText: `certificate-${STAMP}.pdf` });
  await expect(item).toContainText('On file');
  await expect(item).toContainText('Disciples Course certificate');
  await page.screenshot({ path: `${SHOTS}/full-documents-390.png`, fullPage: true });

  // Not a PDF or image: refused with a translated message, not the server text.
  await page.getByTestId('file-input').setInputFiles({ name: 'notes.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ not allowed') });
  await expect(page.locator('[role=alert][data-code]')).toContainText(/That kind of file is not allowed|That file is too large/);

  await item.getByRole('button', { name: /Remove/ }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Document removed.')).toBeVisible();
  await expect(page.locator('li', { hasText: `certificate-${STAMP}.pdf` })).toHaveCount(0);
});

test('a recommended file shows the president\'s recommendation, the guru answer, the letter and a package preview', async ({ browser }) => {
  const page = await open(browser, 'committee');
  await page.goto('/candidates');
  await page.getByRole('link', { name: 'Radha Mondal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Radha Mondal', level: 1 })).toBeVisible();
  await requireModule(page, '/ceremonies');
  await expect(page.getByText('Recommended by the president')).toBeVisible();
  await expect(page.getByText("Guru's office: accepted")).toBeVisible();
  const letter = page.getByRole('link', { name: /Open recommendation letter/ });
  await expect(letter).toHaveAttribute('href', /\/api\/applications\/[0-9a-f-]+\/recommendation\/letter$/);
  // The letter is fetched with the session cookie (an authenticated download), and is a PDF.
  const res = await page.context().request.get((await letter.getAttribute('href')) as string);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('pdf');

  await page.getByRole('button', { name: /Export package for the guru/ }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: "Package for the guru's office" })).toBeVisible();
  await expect(dialog.getByText('Missing documents')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download package (zip)' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

test('the administrator plans a ceremony, attaches an accepted candidate and completes it, which writes the register', async ({ browser }) => {
  const page = await open(browser, 'admin');
  await page.goto('/ceremonies');
  await requireModule(page, '/ceremonies');
  await expect(page.getByRole('heading', { name: 'Ceremonies', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Plan a ceremony' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Create ceremony' }).click();
  await expect(dialog.getByText('Choose a guru.')).toBeVisible();
  await expect(dialog.getByText('Enter the venue.')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Guru' }).selectOption({ label: 'HH Lokanath Swami Maharaj' });
  await dialog.getByRole('textbox', { name: 'Venue' }).fill(`Temple hall ${STAMP}`);
  await dialog.getByLabel('Date').fill(TODAY);
  await dialog.getByRole('button', { name: 'Create ceremony' }).click();
  await expect(page).toHaveURL(/\/ceremonies\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Nobody is attached yet.')).toBeVisible();

  // Radha Mondal was recommended and accepted by the guru's office, so she can be attached.
  const eligible = page.locator('li', { hasText: 'Radha Mondal' });
  await expect(page.getByText(/Who can be attached/)).toBeVisible();
  await page.waitForTimeout(500);
  test.skip((await eligible.count()) === 0, 'Radha Mondal was already initiated by an earlier run of this spec; reseed to run it again');
  await eligible.getByRole('button', { name: /Attach/ }).first().click();
  await expect(page.getByRole('row', { name: /Radha Mondal/ })).toBeVisible();

  // Nobody is marked present yet: the API refuses and the page says why in plain words.
  await page.getByRole('button', { name: 'Complete ceremony' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Complete ceremony' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Nobody is marked present.' })).toBeVisible();

  // Present, but no spiritual name yet: the form asks for it before calling the API.
  await page.getByLabel('Present Radha Mondal').check();
  await page.getByRole('button', { name: 'Complete ceremony' }).click();
  await expect(page.getByText('Every person who was present needs a spiritual name before you can complete the ceremony.')).toBeVisible();
  await expect(page.getByText('Enter the spiritual name.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/full-ceremony-1280.png`, fullPage: true });

  await page.getByLabel('Spiritual name for Radha Mondal').fill(`Radha Priya Devi ${STAMP}`);
  await page.getByRole('button', { name: 'Complete ceremony' }).click();
  const confirm = page.locator('dialog[open]');
  await expect(confirm.getByText('A register entry will be written for each person present (1 in all).')).toBeVisible();
  await confirm.getByRole('button', { name: 'Complete ceremony' }).click();
  await expect(page.getByText('Ceremony completed. The register is written.')).toBeVisible();
  await expect(page.getByText('This ceremony is complete and its register entries are written.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete ceremony' })).toHaveCount(0);

  // The register now has the entry, with the date as written (no time-zone shift).
  await page.getByRole('link', { name: 'Open the register' }).click();
  const row = page.getByRole('row').filter({ hasText: `Radha Priya Devi ${STAMP}` });
  await expect(row).toContainText('Radha Mondal');
  await expect(row).toContainText(TODAY_SHORT);
  await page.screenshot({ path: `${SHOTS}/full-register-1280.png`, fullPage: true });

  // Search and date filters.
  await page.getByLabel('Search by name').fill('priya devi');
  await expect(row).toBeVisible();
  await page.getByLabel('From date').fill('2027-01-01');
  await expect(row).toHaveCount(0);
  await page.getByLabel('From date').fill(TODAY);
  await page.getByLabel('To date').fill(TODAY);
  await expect(row).toBeVisible();

  // A correction needs a reason and is saved.
  await row.getByRole('button', { name: /Correct/ }).click();
  const fix = page.locator('dialog[open]');
  await fix.getByRole('button', { name: 'Save correction' }).click();
  await expect(fix.getByText('A reason is required.')).toBeVisible();
  await fix.getByRole('textbox', { name: /Spiritual name/ }).fill(`Radha Priya Devi Dasi ${STAMP}`);
  await fix.getByRole('textbox', { name: /Reason for the correction/ }).fill('Spelling corrected against the guru\'s letter.');
  await fix.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Entry corrected.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: `Radha Priya Devi Dasi ${STAMP}` })).toBeVisible();
});
