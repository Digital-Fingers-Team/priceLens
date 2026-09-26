import { expect, type Page, test } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';

/** Wait for client JS before interacting (flows.spec.ts covers the no-JS search). */
async function openHydrated(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

async function openMobileMenu(page: Page) {
  await page.getByRole('button', { name: 'Open menu' }).click();
}

test('search → results → product page', async ({ page }) => {
  await openHydrated(page, '/');
  const search = page.getByRole('main').getByPlaceholder('Search products, brands, models...');
  await search.fill('galaxy');
  await search.press('Enter');

  await expect(page).toHaveURL(/\/search\?q=galaxy/);
  const firstResult = page.getByRole('main').locator('a[href^="/products/"]').first();
  await expect(firstResult).toBeVisible();

  await firstResult.click();
  // Generous: under `next dev` the first visit compiles the product route.
  await expect(page).toHaveURL(/\/products\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/galaxy/i);
});

test('empty search browses the catalog instead of a blank page', async ({ page }) => {
  await openHydrated(page, '/search');
  await expect(page.getByRole('main').locator('a[href^="/products/"]').first()).toBeVisible();
});

test('login and logout', async ({ page, request, isMobile }) => {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const email = `e2e_${suffix}@example.com`;
  const password = 'E2ePassword123';
  const registered = await request.post(`${API_URL}/auth/register`, {
    data: { email, password, username: `e2e${suffix}`.slice(0, 20), displayName: 'E2E' },
  });
  expect(registered.status()).toBe(201);

  await openHydrated(page, '/login');
  const form = page.getByRole('main');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password', { exact: true }).fill(password);
  await form.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);

  if (isMobile) await openMobileMenu(page);
  await page.getByRole('button', { name: 'Sign out' }).click();

  if (isMobile) await openMobileMenu(page);
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
});
