import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { sessionFor, SHOTS, type UserKey } from './helpers';

/**
 * One candidate goes the whole way against the real API:
 * committee adds -> advances (shelter, preparing) -> chooses the guru -> mentor confirms a fact and submits
 * -> president sees why a recommendation is blocked and sends the file back -> mentor and candidate see it.
 */
test.describe.configure({ mode: 'serial' });

const NAME = `E2E Candidate ${Date.now().toString(36)}`;
let fileUrl = '';
const contexts: BrowserContext[] = [];

async function open(browser: Parameters<Parameters<typeof test>[2]>[0]['browser'], who: UserKey): Promise<Page> {
  const ctx = await sessionFor(browser, who);
  contexts.push(ctx);
  return ctx.newPage();
}

test.afterAll(async () => {
  for (const c of contexts) await c.close().catch(() => undefined);
});

const confirm = async (page: Page, name: string | RegExp) => page.locator('dialog[open]').getByRole('button', { name }).click();

test('committee adds a candidate with consent, and the dialog explains what is missing', async ({ browser }) => {
  const page = await open(browser, 'committee');
  await page.goto('/candidates');
  await page.getByRole('button', { name: 'Add a candidate' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Add a candidate' })).toBeVisible();

  // Nothing filled in: the form explains, the API is not called.
  await dialog.getByRole('button', { name: 'Add candidate' }).click();
  await expect(dialog.getByText("Enter the candidate's name.")).toBeVisible();
  await expect(dialog.getByText('Consent must be given before the candidate can be added.')).toBeVisible();

  await dialog.getByRole('textbox', { name: 'Full name' }).fill(NAME);
  await dialog.getByRole('textbox', { name: 'Group' }).fill('Newtown sanga');
  await dialog.getByRole('textbox', { name: 'Email address' }).fill(`${NAME.toLowerCase().replace(/\W+/g, '.')}@example.org`);
  await dialog.getByRole('combobox', { name: 'Mentor' }).selectOption({ label: 'Mohan Biswas' });
  await dialog.getByLabel('The candidate has been told this and agrees').check();
  await dialog.getByRole('button', { name: 'Add candidate' }).click();

  await expect(page).toHaveURL(/\/candidates\/[0-9a-f-]{36}$/);
  fileUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
  await expect(page.getByText('Aspiring').first()).toBeVisible();
});

test('committee moves the file to Shelter, then Preparing, and chooses the guru', async ({ browser }) => {
  const page = await open(browser, 'committee');
  await page.goto(fileUrl);

  await page.getByRole('button', { name: 'Move to Shelter' }).click();
  await expect(page.getByText('Enter the shelter date.')).toBeVisible();
  await page.getByLabel('Date the guru accepted them in shelter').fill('2025-12-01');
  await page.getByRole('button', { name: 'Move to Shelter' }).click();
  await expect(page.getByText('Moved to Shelter.')).toBeVisible();

  await page.getByRole('button', { name: 'Move to Preparing' }).click();
  await expect(page.getByText('Moved to Preparing.')).toBeVisible();

  await page.getByLabel('Guru', { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save guru' }).click();
  await expect(page.getByText('Guru saved.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Change guru' })).toBeVisible();

  // Facts the committee owns: the exam is recorded, the practice date is not theirs to set.
  await expect(page.getByLabel('Following the practice standard since')).toHaveCount(0);
  await page.getByLabel('Examination').selectOption('NOT_TAKEN');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
});

test('the mentor sees only their own candidates, filters them, confirms the practice date and submits', async ({ browser }) => {
  const page = await open(browser, 'mohan');
  await page.goto('/candidates');
  await expect(page.getByRole('heading', { name: 'My candidates', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: NAME, exact: true })).toBeVisible();
  // Mohan has no access to Kalyan's candidates.
  await expect(page.getByRole('link', { name: 'Debashis Lahiri', exact: true })).toHaveCount(0);

  // Filters: by stage and by name.
  await page.getByLabel('Stage', { exact: true }).selectOption('PREPARING');
  await expect(page.getByRole('link', { name: NAME, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sunita Roy', exact: true })).toHaveCount(0);
  await page.getByLabel('Search by name').fill('priya');
  await expect(page.getByRole('link', { name: 'Priya Ghosh', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: NAME, exact: true })).toHaveCount(0);
  await page.getByLabel('Search by name').fill('');
  await page.getByLabel('Stage', { exact: true }).selectOption('');

  await page.getByRole('link', { name: NAME, exact: true }).click();
  await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();

  // The mentor can set the practice date and nothing else.
  await expect(page.getByLabel('Accepted in shelter on')).toHaveCount(0);
  await page.getByLabel('Following the practice standard since').fill('2024-06-15');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-rule="R-1"]')).toContainText('1 months'.replace('1 ', '12 '));

  // Unknown items are shown as "needs confirming", not as failures.
  await expect(page.locator('[data-rule="R-3"] .chip')).toHaveText(/Not met|Needs confirming/);

  await page.getByRole('textbox', { name: 'Readiness note' }).fill('Chants 16 rounds daily, attends mangala arati and has read the Prabhupada books.');
  await page.getByRole('button', { name: 'Submit to the president' }).click();
  await expect(page.locator('dialog[open]').getByRole('heading', { name: 'Submit this file?' })).toBeVisible();
  await confirm(page, 'Submit to the president');
  await expect(page.getByText('Submitted to the temple president.')).toBeVisible();
  await expect(page.getByText('Applied').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/live-mentor-file-1280.png`, fullPage: true });
});

/** What the API lets this person do on the file right now (the running API may not have every module yet). */
async function actionsFor(page: Page, applicationId: string) {
  const res = await page.context().request.get(`/api/applications/${applicationId}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { actions: Record<string, boolean | string[]> }).actions;
}
const applicationId = () => fileUrl.split('/').pop() ?? '';

let exceptionRecorded = false;

test('the committee records a written exception for the course, which shows as its own status', async ({ browser }) => {
  const page = await open(browser, 'committee');
  await page.goto(fileUrl);
  await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
  const actions = await actionsFor(page, applicationId());
  test.skip(!actions.canRecordException, 'This API build does not offer exceptions yet; covered by the mocked spec.');
  await page.getByLabel('Reason for R-4').fill('Completed the course in another temple; the certificate is on its way.');
  await page.getByRole('button', { name: /Record exception/ }).filter({ hasText: 'R-4' }).click();
  await expect(page.getByText('Exception recorded.')).toBeVisible();
  const row = page.locator('[data-rule="R-4"]');
  await expect(row).toHaveAttribute('data-status', 'EXCEPTION');
  await expect(row).toContainText('Exception recorded');
  await expect(row).toContainText('was: Needs confirming');
  await expect(row).toContainText('Completed the course in another temple');
  exceptionRecorded = true;
});

test('the president sees the file in the queue and why it is not ready to recommend', async ({ browser }) => {
  const page = await open(browser, 'president');
  await page.goto('/queue');
  await expect(page.getByRole('heading', { name: 'Review queue', level: 1 })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: NAME });
  await expect(row).toContainText('Not yet');
  await expect(row).toContainText(/\d of 4 met/);
  await page.screenshot({ path: `${SHOTS}/live-queue-1280.png`, fullPage: true });
  await row.getByRole('link', { name: NAME, exact: true }).click();

  await expect(page.getByRole('heading', { name: NAME, level: 1 })).toBeVisible();
  await expect(page.getByText('Chants 16 rounds daily')).toBeVisible();
  // The reasons are the unmet checklist items, each with its own status word.
  await expect(page.locator('[data-rule="R-2"]')).toHaveAttribute('data-status', 'NOT_MET');
  await expect(page.locator('[data-rule="R-2"]')).toContainText(/Accepted in shelter for at least \d+ months/);
  await expect(page.locator('[data-rule="R-3"]')).toHaveAttribute('data-status', 'NOT_MET');
  await expect(page.locator('[data-rule="R-3"]')).toContainText('The examination has not been taken yet.');
  // Nobody has recorded the course yet: that is "needs confirming", never "not met" (unless the committee wrote an exception).
  await expect(page.locator('[data-rule="R-4"]')).toHaveAttribute('data-status', exceptionRecorded ? 'EXCEPTION' : 'UNKNOWN');
  // The president cannot edit facts.
  await expect(page.getByLabel('Following the practice standard since')).toHaveCount(0);

  const actions = await actionsFor(page, applicationId());
  if (!actions.canDecide) {
    test.info().annotations.push({ type: 'api', description: 'This API build does not yet offer recommendation actions (canDecide=false); the decision panel is covered by the mocked spec.' });
    await expect(page.getByRole('heading', { name: 'Your recommendation' })).toHaveCount(0);
    return;
  }

  const blocked = page.getByTestId('approve-blocked');
  await expect(blocked).toContainText('You cannot recommend yet');
  await expect(blocked).toContainText('R-2');
  await expect(blocked).toContainText('R-3');
  if (exceptionRecorded) await expect(blocked).not.toContainText('R-4');
  await expect(page.getByRole('radio', { name: /Recommend and generate the letter/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Send back', exact: true }).click();
  await expect(page.getByText('A reason is required to send back or decline.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Reason' }).fill('Please pass the examination before applying.');
  await page.getByRole('button', { name: 'Send back', exact: true }).click();
  await expect(page.getByText('Sent back with your reason.')).toBeVisible();
  await expect(page.getByText('Preparing').first()).toBeVisible();
});

test('the mentor sees the file history on the timeline (and the send-back reason when there was one)', async ({ browser }) => {
  const page = await open(browser, 'mohan');
  await page.goto(fileUrl);
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByText(/Moved from Aspiring to Shelter/)).toBeVisible();
  await expect(page.getByText(/Moved from Shelter to Preparing/)).toBeVisible();
  await expect(page.getByText(/Moved from Preparing to Applied/)).toBeVisible();
  await expect(page.getByText(/Details updated: Following the practice standard since/)).toBeVisible();
  const sentBack = await page.getByText(/Sent back by the president/).count();
  if (sentBack > 0) {
    await expect(page.getByText(/Sent back by the president: Please pass the examination before applying\./)).toBeVisible();
    await page.getByRole('tab', { name: 'Notes and messages' }).click();
    await expect(page.getByText('Please pass the examination before applying.').first()).toBeVisible();
  }
});

