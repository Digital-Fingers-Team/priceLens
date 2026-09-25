/**
 * Opens each store's search page in the same Chromium the connectors use and
 * reports what the browser actually got: status, title, product-card count,
 * and any bot-wall text. Saves a screenshot per store to /out when mounted.
 */
import { chromium } from 'patchright';

const QUERY = process.argv[2] ?? 'samsung galaxy a56';
const q = encodeURIComponent(QUERY);
const STORES: Array<{ slug: string; url: string; card: string }> = [
  { slug: 'amazon', url: `https://www.amazon.eg/s?k=${q}`, card: 'div[data-component-type="s-search-result"]' },
  { slug: 'noon', url: `https://www.noon.com/egypt-en/search/?q=${q}`, card: 'a[href*="/p/"], [data-qa="product-name"]' },
  { slug: 'carrefour', url: `https://www.carrefouregypt.com/mafegy/en/search?keyword=${q}`, card: '[data-testid="product_card"], a[href*="/p/"]' },
  { slug: 'jumia', url: `https://www.jumia.com.eg/catalog/?q=${q}`, card: 'article.prd' },
  { slug: '2b', url: `https://2b.com.eg/en/catalogsearch/result/?q=${q}`, card: '.product-item' },
  { slug: 'aliexpress', url: `https://www.aliexpress.com/w/wholesale-${q}.html`, card: '[class*="search-card-item"], a[href*="/item/"]' },
];

async function main() {
  const only = process.argv[3]?.split(',');
  const context = await chromium.launchPersistentContext('/tmp/probe-profile', {
    executablePath: '/usr/bin/chromium',
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: null,
  });

  for (const store of STORES) {
    if (only && !only.includes(store.slug)) continue;
    const page = await context.newPage();
    let status: number | string = '-';
    try {
      const response = await page.goto(store.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      status = response?.status() ?? 'none';
      // Give JS challenges and client-rendered grids time to settle.
      await page.waitForTimeout(12000);
      const info = await page.evaluate((cardSel) => {
        const text = document.body?.innerText ?? '';
        const wall = /just a moment|verify you are human|access denied|captcha|something went wrong|unusual traffic|robot|blocked/i.exec(text);
        return {
          title: document.title,
          url: location.href,
          cards: document.querySelectorAll(cardSel).length,
          wall: wall ? wall[0] : null,
          snippet: text.replace(/\s+/g, ' ').slice(0, 160),
        };
      }, store.card);
      console.log(`\n[${store.slug}] status=${status} cards=${info.cards} wall=${info.wall}`);
      console.log(`   title: ${info.title.slice(0, 80)}`);
      console.log(`   url:   ${info.url.slice(0, 110)}`);
      console.log(`   text:  ${info.snippet}`);
      await page.screenshot({ path: `/out/${store.slug}.png` }).catch(() => undefined);
    } catch (error) {
      console.log(`\n[${store.slug}] status=${status} THREW ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
  await context.close();
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
