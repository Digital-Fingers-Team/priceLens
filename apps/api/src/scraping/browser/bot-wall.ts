import type { Page } from 'patchright';

/**
 * Cloudflare and Akamai answer non-browser clients with 403 (or 503 while a
 * challenge is pending). Anything else is a real error and is not retried in
 * a browser.
 */
export function isBotWallRefusal(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 403 || status === 503;
}

/** Title/text the interstitial challenge pages show while they run. */
const CHALLENGE_TEXT = /just a moment|performing security verification|checking your browser|verify you are human|attention required/i;

/**
 * Opens `url` and waits for an interstitial bot challenge to finish, if one is
 * shown. The challenge is solved by the browser itself (it is a JS/timing
 * check, not a CAPTCHA a person has to answer); once it passes, the site sets
 * a clearance cookie on the shared persistent profile, so later requests from
 * the same store's browser go straight through.
 *
 * Throws if the page is still a challenge after `timeoutMs` -- the caller's
 * search then fails loudly instead of parsing a challenge page as "no results".
 */
export async function openThroughBotWall(page: Page, url: string, timeoutMs = 45000): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const waitForClear = (ms: number) =>
    page
      .waitForFunction(
        (pattern) => !new RegExp(pattern, 'i').test(`${document.title} ${document.body?.innerText.slice(0, 300) ?? ''}`),
        CHALLENGE_TEXT.source,
        { timeout: ms, polling: 1000 },
      )
      .then(() => true)
      .catch(() => false);

  // Most challenges clear on their own. Jumia's shows a Turnstile widget that
  // waits for its checkbox to be clicked -- confirmed live: never clears on its
  // own, clears on the first click.
  let cleared = await waitForClear(10000);
  for (let attempt = 0; !cleared && attempt < 3; attempt++) {
    await clickTurnstile(page);
    cleared = await waitForClear(Math.max(5000, (timeoutMs - 10000) / 3));
  }
  if (!cleared) {
    throw new Error(`still on a bot challenge page after ${timeoutMs / 1000}s: ${url}`);
  }
  // The challenge redirects back to the requested URL; let that navigation land.
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}

/** Clicks the Cloudflare Turnstile checkbox, if the page is showing one. */
async function clickTurnstile(page: Page): Promise<void> {
  const frame = page.frames().find((candidate) => candidate.url().includes('challenges.cloudflare.com'));
  const element = frame ? await frame.frameElement().catch(() => null) : null;
  const box = element ? await element.boundingBox().catch(() => null) : null;
  if (!box) return;
  // The checkbox sits at the widget's left edge, vertically centred. Moving
  // there in steps rather than teleporting is part of what the widget checks.
  const x = box.x + 30;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.click(x, y);
}
