/**
 * Loads a page and prints every cookie whose value mentions a currency or
 * locale, to find which cookie a store keys its currency/region on.
 *
 *   ts-node scripts/probe-cookies.ts <url> [cookie=value;domain ...]
 */
import { chromium } from 'patchright';

async function main() {
  const [url, ...preset] = process.argv.slice(2);
  const context = await chromium.launchPersistentContext(process.env.PROFILE ?? '/tmp/cookie-profile', {
    executablePath: '/usr/bin/chromium',
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: { width: 1366, height: 850 },
  });
  for (const spec of preset) {
    const [pair, domain] = spec.split(';');
    const eq = pair.indexOf('=');
    await context.addCookies([{ name: pair.slice(0, eq), value: pair.slice(eq + 1), domain, path: '/' }]);
  }
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log(`goto: ${e}`));
  await page.waitForTimeout(12000);
  for (const cookie of await context.cookies()) {
    if (/SAR|EGP|USD|locale|region|currency|c_tp|x_l|site=/i.test(`${cookie.name}=${cookie.value}`)) {
      console.log(`${cookie.domain} ${cookie.name}=${decodeURIComponent(cookie.value).slice(0, 160)}`);
    }
  }
  const prices = await page.evaluate(() =>
    (document.body.innerText.match(/(SAR|EGP|US ?\$|ر\.س|ج\.م)\s?[\d,.]+|[\d,.]+\s?(SAR|EGP|ر\.س|ج\.م)/g) ?? []).slice(0, 5),
  );
  console.log(`title="${await page.title()}" lang=${await page.evaluate(() => document.documentElement.lang)} prices=${JSON.stringify(prices)}`);
  await context.close();
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
