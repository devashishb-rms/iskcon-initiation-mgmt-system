import { test, type Page } from '@playwright/test';
import { sessionFor, SHOTS, type UserKey } from './helpers';

/**
 * Screenshots of every screen at phone and desktop width, with real data from the API.
 * Run with SCREENSHOTS=1 (they are for looking at; the other specs are the checks).
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to refresh the screenshots');

const SIZES = [
  { tag: '390', width: 390, height: 844 },
  { tag: '1280', width: 1280, height: 900 },
] as const;

interface Shot {
  who: UserKey;
  name: string;
  path: string | ((page: Page) => Promise<string>);
  /** Text that proves the data has arrived. */
  ready: string | RegExp;
}

const firstFileLink = (listPath: string) => async (page: Page) => {
  await page.goto(listPath);
  const link = page.locator('main a.strong').first();
  await link.waitFor();
  return (await link.getAttribute('href')) ?? listPath;
};

const SHOTLIST: Shot[] = [
  { who: 'ananya', name: 'path', path: '/path', ready: /Hare Krishna, /i },
  { who: 'committee', name: 'candidates', path: '/candidates', ready: 'Radha Mondal' },
  { who: 'committee', name: 'file', path: firstFileLink('/candidates'), ready: 'Checklist against' },
  { who: 'president', name: 'queue', path: '/queue', ready: /waiting/ },
  { who: 'president', name: 'file-review', path: firstFileLink('/queue'), ready: 'Checklist against' },
  { who: 'admin', name: 'rules', path: '/rules', ready: 'Temple baseline' },
  { who: 'committee', name: 'ceremonies', path: '/ceremonies', ready: 'Ceremonies' },
  { who: 'committee', name: 'ceremony', path: firstFileLink('/ceremonies'), ready: 'People attending' },
  { who: 'committee', name: 'register', path: '/register', ready: 'Register' },
  { who: 'committee', name: 'notifications', path: '/notifications', ready: 'Notifications' },
  { who: 'admin', name: 'import', path: '/import', ready: 'Import candidates' },
  { who: 'admin', name: 'people', path: '/people', ready: 'People' },
  { who: 'admin', name: 'audit', path: '/audit', ready: 'Audit log' },
];

for (const size of SIZES) {
  for (const shot of SHOTLIST) {
    test(`${shot.name} at ${size.tag}px`, async ({ browser }) => {
      const ctx = await sessionFor(browser, shot.who, { width: size.width, height: size.height });
      const page = await ctx.newPage();
      const target = typeof shot.path === 'string' ? shot.path : await shot.path(page);
      await page.goto(target);
      await page.getByText(shot.ready).first().waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/${shot.name}-${size.tag}.png`, fullPage: true });
      await ctx.close();
    });
  }
}
