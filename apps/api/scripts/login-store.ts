/**
 * One-time interactive setup for a browser-driven connector: opens a real,
 * visible Chrome window against a persistent profile dir. Log in (Noon) or
 * solve the CAPTCHA (Alibaba) manually, then close the window (or wait for
 * the timeout) — the resulting session persists in that profile dir and
 * gets reused by the matching connector on every later automated visit.
 *
 * Usage: npm run login:noon | npm run login:alibaba
 */
import * as path from 'path';
import { chromium } from 'patchright';

async function main() {
  const storeSlug = process.argv[2] ?? 'noon';
  const homeUrl = process.argv[3] ?? 'https://www.noon.com/uae-en/';
  const profileRoot = process.env.BROWSER_PROFILE_DIR ?? path.join(process.cwd(), '.browser-profiles');
  const profileDir = path.join(profileRoot, storeSlug);

  console.log(`Opening ${homeUrl} with profile ${profileDir}`);
  console.log('Log in manually in the window that opens. It closes itself in 3 minutes.');

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1366, height: 850 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });

  await page.waitForTimeout(180_000);
  await context.close();
  console.log('Session saved. You can now enable this connector.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
