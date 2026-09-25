/**
 * Loads a Cloudflare-protected page, and if the challenge does not clear on
 * its own, clicks the Turnstile checkbox and reports whether that got through.
 */
import { chromium } from 'patchright';

const CHALLENGE = /just a moment|performing security verification|verify you are human/i;

async function main() {
  const url = process.argv[2];
  const context = await chromium.launchPersistentContext(process.env.PROFILE ?? '/tmp/ts-profile', {
    executablePath: '/usr/bin/chromium',
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: { width: 1366, height: 850 },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log(`goto: ${e}`));

  const state = async (label: string) => {
    const title = await page.title().catch(() => '?');
    const frames = page.frames().map((f) => f.url()).filter((u) => u.includes('challenges.cloudflare.com'));
    console.log(`${label}: title="${title}" challenge=${CHALLENGE.test(title)} turnstileFrames=${frames.length}`);
    return CHALLENGE.test(title);
  };

  await page.waitForTimeout(10000);
  if (!(await state('after 10s'))) return finish();

  for (let attempt = 1; attempt <= 3; attempt++) {
    const frame = page.frames().find((f) => f.url().includes('challenges.cloudflare.com'));
    const handle = frame ? await frame.frameElement().catch(() => null) : null;
    const box = handle ? await handle.boundingBox() : null;
    if (box) {
      // The checkbox sits at the left edge of the widget, vertically centred.
      await page.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 12 });
      await page.mouse.click(box.x + 30, box.y + box.height / 2);
      console.log(`clicked turnstile at ${Math.round(box.x + 30)},${Math.round(box.y + box.height / 2)}`);
    } else {
      console.log('no turnstile frame found to click');
    }
    await page.waitForTimeout(12000);
    if (!(await state(`after click ${attempt}`))) break;
  }
  await finish();

  async function finish() {
    await page.screenshot({ path: '/out/turnstile.png' }).catch(() => undefined);
    const products = await page.evaluate(() => document.querySelectorAll('article.prd').length).catch(() => -1);
    console.log(`final: title="${await page.title()}" jumiaProducts=${products}`);
    await context.close();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
