import { expect, type Page, test } from '@playwright/test';

/**
 * Final QA (phase 11): every key page in both languages and both colour
 * schemes at each project's width, plus the exploratory cases -- odd input,
 * back/refresh mid-flow, a slow API and going offline. Runs in every project
 * (375 / 768 / 1440).
 */

const NAV = { timeout: 20_000 };

async function openHydrated(page: Page, path: string) {
  const response = await page.goto(path);
  await page.waitForLoadState('networkidle');
  return response;
}

/** Uncaught exceptions and any alert() while `run` executes. */
async function watchForFailures(page: Page, run: () => Promise<void>) {
  const failures: string[] = [];
  const onError = (err: Error) => failures.push(`pageerror: ${err.message}`);
  const onDialog = (dialog: { message(): string; dismiss(): Promise<void> }) => {
    failures.push(`dialog: ${dialog.message()}`);
    void dialog.dismiss();
  };
  page.on('pageerror', onError);
  page.on('dialog', onDialog);
  try {
    await run();
  } finally {
    page.off('pageerror', onError);
    page.off('dialog', onDialog);
  }
  return failures;
}

async function firstProductPath(page: Page): Promise<string> {
  await openHydrated(page, '/search?q=galaxy');
  const href = await page.getByRole('main').locator('a[href^="/products/"]').first().getAttribute('href');
  expect(href).toBeTruthy();
  return href!;
}

async function firstCategoryPath(page: Page): Promise<string> {
  await openHydrated(page, '/');
  const href = await page.locator('a[href^="/categories/"]').first().getAttribute('href');
  expect(href).toBeTruthy();
  return href!;
}

/** Relative luminance of the body background, 0 (black) to 1 (white). */
async function backgroundLuminance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body)
      .backgroundColor.match(/\d+(\.\d+)?/g)!
      .slice(0, 3)
      .map((v) => Number(v) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    test('key pages in both languages: status, direction, one h1, no sideways scroll', async ({ page }) => {
      test.setTimeout(300_000);
      const product = await firstProductPath(page);
      const category = await firstCategoryPath(page);
      const paths = ['/', '/search?q=galaxy', '/search', product, category, '/pricing', '/login', '/deal-hunter'];

      const problems: string[] = [];
      for (const prefix of ['', '/en']) {
        for (const path of paths) {
          const url = `${prefix}${path === '/' && prefix ? '' : path}`;
          const failures = await watchForFailures(page, async () => {
            const response = await openHydrated(page, url);
            if (response?.status() !== 200) problems.push(`${url}: HTTP ${response?.status()}`);
          });
          problems.push(...failures.map((f) => `${url}: ${f}`));

          const dir = await page.locator('html').getAttribute('dir');
          if (dir !== (prefix ? 'ltr' : 'rtl')) problems.push(`${url}: dir=${dir}`);

          const h1 = await page.locator('h1').count();
          if (h1 !== 1) problems.push(`${url}: ${h1} h1`);

          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (overflow > 1) problems.push(`${url}: ${overflow}px horizontal overflow`);

          const luminance = await backgroundLuminance(page);
          if (scheme === 'dark' ? luminance > 0.1 : luminance < 0.5) {
            problems.push(`${url}: background luminance ${luminance.toFixed(2)} in ${scheme}`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  });
}

test('odd search input is shown as text, never run, and never breaks the page', async ({ page }) => {
  test.setTimeout(180_000);
  const inputs = [
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "galaxy' OR 1=1 --",
    '100%',
    'سامسونج جالاكسي',
    '📱🔥 galaxy',
    'a'.repeat(300),
    '   ',
  ];
  const problems: string[] = [];
  for (const q of inputs) {
    const failures = await watchForFailures(page, async () => {
      const response = await openHydrated(page, `/search?q=${encodeURIComponent(q)}`);
      if (response?.status() !== 200) problems.push(`${q.slice(0, 20)}: HTTP ${response?.status()}`);
    });
    problems.push(...failures.map((f) => `${q.slice(0, 20)}: ${f}`));
    // Results, or an empty state; never the error boundary.
    await expect(page.getByRole('main')).not.toContainText(/something went wrong/i);
    const injected = await page.locator('img[src="x"]').count();
    if (injected) problems.push(`${q.slice(0, 20)}: injected element rendered`);
  }
  expect(problems).toEqual([]);
});

test('back and refresh in the middle of a flow keep the user where they were', async ({ page }) => {
  await openHydrated(page, '/search?q=galaxy');
  const firstResult = page.getByRole('main').locator('a[href^="/products/"]').first();
  await firstResult.click();
  await expect(page).toHaveURL(/\/products\//, NAV);
  await page.reload();
  await page.waitForLoadState('networkidle'); // hydrated, as a person would be
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/search\?q=galaxy/, NAV);
  await expect(page.getByRole('main').locator('a[href^="/products/"]').first()).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/products\//, NAV);
});

test('quick repeated searches end on the last one', async ({ page }) => {
  await openHydrated(page, '/search?q=galaxy');
  const box = page.getByRole('main').getByRole('searchbox', { name: 'Search products' });
  for (const q of ['iphone', 'xiaomi', 'galaxy a57']) {
    await box.fill(q);
    await box.press('Enter');
  }
  await expect(page).toHaveURL(/[?&]q=galaxy(\+|%20)a57/, NAV);
  await expect(box).toHaveValue('galaxy a57');
});

test('a slow search keeps the current results on screen, marked busy, until the new ones arrive', async ({ page }) => {
  await openHydrated(page, '/search?q=galaxy');
  // A search is a navigation the server renders (search/page.tsx); slow it down.
  await page.route(/\/search\?.*_rsc=/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });
  const box = page.getByRole('main').getByRole('searchbox', { name: 'Search products' });
  await box.fill('iphone');
  await box.press('Enter');
  const busy = page.getByRole('main').locator('[aria-busy="true"]');
  await expect(busy.first()).toBeVisible();
  await expect(busy.first().locator('a[href^="/products/"]').first()).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=iphone/, NAV);
  await expect(busy).toHaveCount(0, NAV);
  await expect(page.getByRole('main').locator('a[href^="/products/"]').first()).toBeVisible();
});

test('searching again while the API is down keeps the results on screen', async ({ page }) => {
  await openHydrated(page, '/search?q=galaxy');
  const failed = page.waitForEvent('requestfailed', {
    predicate: (r) => /\/api\/v1\/search\?/.test(r.url()),
    ...NAV,
  });
  await page.route('**/api/v1/search?**', (route) => route.abort('internetdisconnected'));
  // The same query again is a refetch in the browser, not a navigation.
  await page.getByRole('main').getByRole('searchbox', { name: 'Search products' }).press('Enter');
  await failed;
  await page.waitForTimeout(8_000); // past the retries
  await expect(page.getByRole('main').locator('a[href^="/products/"]').first()).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('a failed background price refresh keeps the product on screen', async ({ page }) => {
  const product = await firstProductPath(page);
  // The browser refreshes a product whose page data is over two minutes old
  // (cached HTML). Start the page's clock three minutes ahead so that refresh
  // happens on load, and make it fail the way a 429 or an API restart would.
  await page.clock.install({ time: Date.now() + 3 * 60_000 });
  await page.route('**/api/v1/products/**', (route) => route.fulfill({ status: 503, body: '{}' }));
  const refresh = page.waitForResponse((r) => /\/api\/v1\/products\//.test(r.url()) && r.status() === 503, NAV);
  await page.goto(product);
  await refresh;
  await page.clock.runFor(10_000); // past the retries
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('the Arabic pricing page names the plans in Arabic', async ({ page }) => {
  await openHydrated(page, '/pricing');
  await expect(page.getByRole('heading', { level: 2, name: 'مجاني' })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('Compare prices, track a handful of products');
});
