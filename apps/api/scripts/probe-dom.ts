/**
 * Dumps what a store's search page really contains, to rebuild a connector's
 * selectors: the main document's response headers, then the outer HTML of the
 * first matches of a selector (attributes kept, long text trimmed).
 *
 *   ts-node scripts/probe-dom.ts <url> <selector> [count] [waitMs]
 */
import { chromium } from 'patchright';

async function main() {
  const [url, selector, countArg, waitArg] = process.argv.slice(2);
  const count = Number(countArg ?? 2);
  const context = await chromium.launchPersistentContext(process.env.PROFILE ?? '/tmp/probe-profile', {
    executablePath: '/usr/bin/chromium',
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: null,
    acceptDownloads: false,
  });
  const page = await context.newPage();
  page.on('response', (response) => {
    if (response.request().isNavigationRequest()) {
      const h = response.headers();
      console.log(`NAV ${response.status()} ${response.url().slice(0, 100)}`);
      console.log(`    content-type=${h['content-type']} disposition=${h['content-disposition'] ?? '-'} encoding=${h['content-encoding'] ?? '-'}`);
    }
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (error) {
    console.log(`goto: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
  }
  await page.waitForTimeout(Number(waitArg ?? 12000));
  const dump = await page
    .evaluate(
      ({ sel, n }) => {
        const nodes = Array.from(document.querySelectorAll(sel)).slice(0, n);
        const trim = (el: Element): string => {
          const clone = el.cloneNode(true) as Element;
          clone.querySelectorAll('svg, script, style, noscript').forEach((x) => x.remove());
          return clone.outerHTML.replace(/\s+/g, ' ').replace(/(src|srcset|style)="[^"]{60,}"/g, '$1="…"');
        };
        return { title: document.title, total: document.querySelectorAll(sel).length, html: nodes.map(trim) };
      },
      { sel: selector, n: count },
    )
    .catch((error) => ({ title: 'evaluate failed', total: 0, html: [String(error)] }));
  console.log(`title="${dump.title}" matches=${dump.total}`);
  for (const html of dump.html) console.log(`\n${html.slice(0, 3500)}`);
  await context.close();
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
