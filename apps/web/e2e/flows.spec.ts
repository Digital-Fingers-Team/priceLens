import { expect, type ConsoleMessage, type Page, test } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';

// Client navigations under `next dev` on the shared (busy) server can take
// longer than the 5 s default.
const NAV = { timeout: 20_000 };

/**
 * Flows added in phase 05 (audit/05-frontend.md, FE-11): the URL as search
 * state, the store link, real 404s, search without JavaScript, and a clean
 * console (no hydration errors) signed out and signed in.
 */

async function openHydrated(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/** Console errors/warnings and uncaught exceptions while `run` executes. */
async function collectConsoleProblems(page: Page, run: () => Promise<void>) {
  const problems: string[] = [];
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`${msg.type()} on ${new URL(page.url()).pathname}: ${msg.text()}`);
  };
  const onError = (err: Error) => problems.push(`pageerror on ${new URL(page.url()).pathname}: ${err.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onError);
  try {
    await run();
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onError);
  }
  return problems;
}

async function firstProductPath(page: Page): Promise<string> {
  await openHydrated(page, '/search?q=galaxy');
  const href = await page.getByRole('main').locator('a[href^="/products/"]').first().getAttribute('href');
  expect(href).toBeTruthy();
  return href!;
}

test('filters and sort live in the URL, and back/forward restores them', async ({ page }) => {
  await openHydrated(page, '/search?q=galaxy');
  await expect(page.getByRole('main').locator('a[href^="/products/"]').first()).toBeVisible();

  // Sort sits on the results bar (audit 06, U-05); one choice sets both.
  await page.getByLabel('Sort', { exact: true }).selectOption('minPriceUsd');
  await expect(page).toHaveURL(/[?&]sortBy=minPriceUsd/, NAV);
  await expect(page).toHaveURL(/[?&]sortDir=asc/);
  await expect(page).toHaveURL(/[?&]q=galaxy/);

  // A reload (or a shared link) gives the same state back.
  await page.reload();
  await expect(page.getByLabel('Sort', { exact: true })).toHaveValue('minPriceUsd');

  // A new search, then back: the box and the URL show the earlier search.
  const box = page.getByRole('main').getByRole('searchbox', { name: 'Search products' });
  await box.fill('iphone');
  await box.press('Enter');
  await expect(page).toHaveURL(/[?&]q=iphone/, NAV);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]q=galaxy/, NAV);
  await expect(box).toHaveValue('galaxy');
  await page.goBack();
  await expect(page).not.toHaveURL(/sortBy=/, NAV);
});

test('product page links out to the store in a new tab, through the click tracker', async ({ page }) => {
  await openHydrated(page, await firstProductPath(page));
  const storeLink = page.getByRole('link', { name: /^Go to .+ \(opens in a new tab\)$/ }).first();
  await expect(storeLink).toHaveAttribute('href', /\/api\/v1\/affiliate\/go\/[^/]+$/);
  await expect(storeLink).toHaveAttribute('target', '_blank');
  await expect(storeLink).toHaveAttribute('rel', /sponsored.*noopener/);
});

test('an unknown product is a real 404', async ({ page }) => {
  const res = await page.goto('/products/no-such-product-phase05-check');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('the Arabic UI is right-to-left and keeps English URLs un-prefixed', async ({ page }) => {
  await openHydrated(page, '/ar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const box = page.getByRole('main').getByRole('searchbox').first();
  await box.fill('galaxy');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/ar\/search\?q=galaxy/);
  await expect(page.getByRole('main').locator('a[href^="/ar/products/"]').first()).toBeVisible();

  const res = await page.goto('/en/search?q=galaxy');
  expect(res?.url()).toMatch(/\/search\?q=galaxy$/);
  expect(res?.url()).not.toMatch(/\/en\//);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('the theme toggle switches to dark and survives a reload', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the toggle is in the desktop navbar');
  await openHydrated(page, '/');
  // Cycles system → light → dark.
  const toggle = page.getByRole('banner').getByRole('button', { name: /^Theme: / }).first();
  await expect(toggle).toHaveAccessibleName(/^Theme: system/);
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAccessibleName(/^Theme: dark/);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the search form still searches', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('main').getByRole('searchbox', { name: 'Search products' });
    await box.fill('galaxy');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=galaxy/);
  });
});

test('no console errors or hydration warnings on key pages, signed out and signed in', async ({ page, request }) => {
  // Twenty full page loads.
  test.setTimeout(360_000);
  const productPath = await firstProductPath(page);
  const pages = ['/', '/search?q=galaxy', productPath, '/login', '/pricing', '/no-such-page', '/ar', `/ar${productPath}`];

  const visitAll = async () => {
    for (const path of pages) await openHydrated(page, path);
  };

  const signedOut = await collectConsoleProblems(page, visitAll);

  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const email = `e2e_${suffix}@example.com`;
  const password = 'E2ePassword123';
  const registered = await request.post(`${API_URL}/auth/register`, {
    data: { email, password, username: `e2e${suffix}`.slice(0, 20) },
  });
  expect(registered.status()).toBe(201);
  await openHydrated(page, '/login');
  await page.getByRole('main').getByLabel('Email').fill(email);
  await page.getByRole('main').getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('main').getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/, NAV);

  // The signed-in pass is where a server/client render mismatch shows up.
  const signedIn = await collectConsoleProblems(page, visitAll);

  // Expected, not defects:
  // - the 404 page's own document request logs a failed resource;
  // - the dev seed gives many products one shared placeholder image URL
  //   (dummyimage.com). Next tracks the LCP hint per URL, so a later,
  //   non-priority card with the same URL trips it. Real product images are
  //   unique per product, and the first row is loaded with priority.
  const relevant = (list: string[]) =>
    list.filter((p) => !/status of 404/.test(p) && !/dummyimage\.com.*Largest Contentful Paint/.test(p));
  expect(relevant(signedOut)).toEqual([]);
  expect(relevant(signedIn)).toEqual([]);
});
