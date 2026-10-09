/**
 * One-time interactive setup for a browser-driven connector: opens a visible
 * browser window on the store's own profile. Log in (Noon) or solve the
 * CAPTCHA (Alibaba) through noVNC, then wait for the timeout -- the session
 * persists in that profile and is reused by the connector on every later
 * automated visit.
 *
 * In the worker container (ENABLE_NOVNC=true, then deploy-api.sh --no-build):
 *   1. Set ALIBABA_ENABLED=false (or the store's flag) and restart too: the
 *      worker's own browser holds the profile, and a second one cannot open it.
 *   2. podman exec -d -w /repo/apps/api pricelens-worker sh -c \
 *        "DISPLAY=:99 ./node_modules/.bin/ts-node scripts/ops/login-store.ts alibaba <url> > /tmp/login.log 2>&1"
 *   3. Tunnel to noVNC, solve it, wait for the window to close (LOGIN_MINUTES).
 *   4. Turn the store back on and noVNC off, and restart.
 *
 * Usage: npm run login:noon | npm run login:alibaba
 */
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'patchright';

/** The worker image has Debian's Chromium, not Google Chrome. */
const SYSTEM_CHROMIUM = '/usr/bin/chromium';

async function main() {
  const storeSlug = process.argv[2] ?? 'noon';
  const homeUrl = process.argv[3] ?? 'https://www.noon.com/egypt-en/';
  const minutes = Number(process.env.LOGIN_MINUTES ?? 30);
  const profileRoot = process.env.BROWSER_PROFILE_DIR ?? path.join(process.cwd(), '.browser-profiles');
  const profileDir = path.join(profileRoot, storeSlug);

  // Chromium's lock names the host that took it. Each deploy is a new
  // container (a new hostname), so a lock left by the old one makes the
  // launch hang until it times out (2026-10-09). Nothing else uses the
  // profile now (step 1 above), so the lock is stale.
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    fs.rmSync(path.join(profileDir, name), { force: true });
  }

  console.log(`Opening ${homeUrl} with profile ${profileDir}`);
  console.log(`Log in or solve the CAPTCHA in the window. It closes itself in ${minutes} minutes.`);

  const context = await chromium.launchPersistentContext(profileDir, {
    ...(fs.existsSync(SYSTEM_CHROMIUM) ? { executablePath: SYSTEM_CHROMIUM } : { channel: 'chrome' as const }),
    headless: false,
    viewport: null,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' }).catch((error: Error) => console.log(`goto: ${error.message}`));

  await page.waitForTimeout(minutes * 60_000);
  await context.close();
  console.log('Session saved. You can now enable this connector.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
