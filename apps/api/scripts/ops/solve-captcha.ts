/**
 * Opens a store's page in its persistent profile on a display a person is
 * watching over noVNC, waits for them to solve the CAPTCHA by hand, and closes
 * the browser once real results are showing -- so the solved session is saved
 * to the profile the connector uses.
 *
 *   ts-node scripts/ops/solve-captcha.ts <store> <url> <resultSelector> [cookie=value;domain ...]
 */
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'patchright';

async function main() {
  const [store, url, resultSelector, ...cookies] = process.argv.slice(2);
  const profileDir = path.join(process.env.BROWSER_PROFILE_DIR ?? '/profiles', store);
  // Only run while the API is not using this profile; its lock is then stale.
  for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    fs.rmSync(path.join(profileDir, lock), { force: true });
  }
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: '/usr/bin/chromium',
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--start-maximized'],
    viewport: null,
  });
  for (const spec of cookies) {
    const [pair, domain] = spec.split(';');
    const eq = pair.indexOf('=');
    await context.addCookies([{ name: pair.slice(0, eq), value: pair.slice(eq + 1), domain, path: '/' }]);
  }
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined);
  console.log(`WAITING: solve the CAPTCHA for ${store}`);

  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const count = await page
      .evaluate((sel) => document.querySelectorAll(sel).length, resultSelector)
      .catch(() => 0);
    const title = await page.title().catch(() => '');
    if (count > 0 && !/captcha/i.test(title)) {
      const prices = await page
        .evaluate(() => (document.body.innerText.match(/(SAR|EGP|US\s?\$|USD)\s?[\d,.]+/g) ?? []).slice(0, 3))
        .catch(() => []);
      console.log(`SOLVED: ${count} results on "${title}", sample prices ${JSON.stringify(prices)}`);
      await page.waitForTimeout(5000);
      await context.close();
      return;
    }
    await page.waitForTimeout(3000);
  }
  console.log('TIMEOUT: not solved within 15 minutes');
  await context.close();
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
