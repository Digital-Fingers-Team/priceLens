/**
 * Full-page screenshots of every route and key state at 375 / 768 / 1440 px,
 * in English and Arabic, light and dark (phase 06 UX / phase 07 UI
 * before-and-after record). Not a test: run it
 * against a running stack with
 *
 *   E2E_BASE_URL=http://localhost:13000 E2E_API_URL=http://localhost:13001/api/v1 \
 *     node e2e/screenshots.mjs <out-dir>
 *
 * Signed-in pages use a throwaway account registered on that stack.
 * SHOTS_ONLY=product,search limits the run to names containing those words;
 * SHOTS_LOCALES=en and SHOTS_THEMES=light limit the other two axes.
 * Files are named <name>-<locale>-<theme>-<width>.png.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';
const OUT = process.argv[2] ?? 'ux-screenshots/before';
const WIDTHS = (process.env.SHOTS_WIDTHS ?? "375,768,1440").split(",").map(Number);
const LOCALES = (process.env.SHOTS_LOCALES ?? 'en,ar').split(',');
const THEMES = (process.env.SHOTS_THEMES ?? 'light,dark').split(',');
// Accessible names of the buttons the script clicks.
const LABELS = { en: { menu: /open menu/i, filters: /Filters/ }, ar: { menu: /فتح القائمة/, filters: /التصفية/ } };
const ONLY = (process.env.SHOTS_ONLY ?? '').split(',').filter(Boolean);
const wanted = (name) => ONLY.length === 0 || ONLY.some((w) => name.includes(w));

async function settle(page, path) {
  // next dev compiles each route on first visit; the shared box is slow.
  // A navigation the previous click started can abort this one; retry once.
  await page.goto(BASE + path, { timeout: 120_000 }).catch(() => page.goto(BASE + path, { timeout: 120_000 }));
  await page.waitForLoadState('networkidle');
  // Client queries start after hydration; wait for skeletons to go.
  await page
    .waitForFunction(() => document.querySelectorAll('.animate-pulse').length === 0, null, { timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(400);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // A product that exists on this stack.
  const probe = await (await fetch(`${API}/search?q=galaxy&limit=1`)).json();
  const slug = probe.data.hits[0].slug;

  const guest = [
    ['home', '/'],
    ['search', '/search?q=galaxy'],
    ['search-empty-query', '/search'],
    ['search-no-results', '/search?q=zzzqqqnothing'],
    ['product', `/products/${slug}`],
    ['product-404', '/products/no-such-product'],
    ['login', '/login'],
    ['register', '/register'],
    ['pricing', '/pricing'],
    ['deal-hunter', '/deal-hunter'],
    ['watchlist-guest', '/watchlist'],
    ['not-found', '/no-such-page'],
    ['design-system', '/design-system'],
  ];
  const member = [
    ['home-signed-in', '/'],
    ['product-signed-in', `/products/${slug}`],
    ['watchlist', '/watchlist'],
    ['notifications', '/notifications'],
    ['account-notifications', '/account/notifications'],
    ['account-billing', '/account/billing'],
    ['seller', '/seller'],
  ];

  const suffix = `${Date.now().toString(36)}`;
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `shots_${suffix}@example.com`,
      password: 'ShotsPassword123',
      username: `shots${suffix}`.slice(0, 20),
    }),
  });
  const auth = (await reg.json()).data;

  for (const locale of LOCALES)
  for (const theme of THEMES)
  for (const width of WIDTHS) {
    // The theme follows the system until the toggle is used.
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
    const page = await context.newPage();
    const prefix = locale === 'en' ? '' : `/${locale}`;
    const at = (path) => prefix + (path === '/' && prefix ? '' : path);
    const file = (name) => join(OUT, `${name}-${locale}-${theme}-${width}.png`);
    for (const [name, path] of guest.filter(([n]) => wanted(n))) {
      await settle(page, at(path));
      await page.screenshot({ path: file(name), fullPage: true });
    }
    if (width === 375 && wanted('mobile-menu')) {
      await settle(page, at('/'));
      await page.getByRole('button', { name: LABELS[locale].menu }).click();
      await page.screenshot({ path: file('mobile-menu') });
    }
    if (wanted('search-filters-open')) {
      await settle(page, at('/search?q=galaxy'));
      await page.getByRole('button', { name: LABELS[locale].filters }).click();
      await page.screenshot({ path: file('search-filters-open'), fullPage: true });
    }
    await settle(page, at('/'));

    // Sign in by seeding the same storage the app writes on login.
    await page.evaluate((a) => {
      localStorage.setItem('pl_access_token', a.accessToken);
      localStorage.setItem('pl_refresh_token', a.refreshToken);
      localStorage.setItem('pl-auth', JSON.stringify({ state: { user: a.user, isAuthenticated: true }, version: 0 }));
    }, auth);
    for (const [name, path] of member.filter(([n]) => wanted(n))) {
      await settle(page, at(path));
      await page.screenshot({ path: file(name), fullPage: true });
    }
    await context.close();
  }
  await browser.close();
  console.log(`screenshots written to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
