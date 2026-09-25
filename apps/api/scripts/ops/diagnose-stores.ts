/**
 * Runs every retailer connector against the same queries and prints what each
 * one returns, so "this store never produces listings" can be told apart into
 * blocked / empty / broken-parser / wrong-currency.
 *
 * Uses its own browser profile directory (BROWSER_PROFILE_DIR) so it can run
 * next to the live API without fighting over a profile lock.
 *
 *   ts-node scripts/ops/diagnose-stores.ts [store,store] ["query" ...]
 */
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import retailersConfig from '../../src/config/retailers.config';
import { BrowserSessionService } from '../../src/scraping/browser/browser-session.service';
import { CONNECTOR_CLASSES as CONNECTORS } from '../../src/scraping/connectors/connector.registry';
import { RetailerConnector } from '../../src/scraping/interfaces/retailer-connector.interface';

async function main() {
  const [storeArg, ...queryArgs] = process.argv.slice(2);
  const stores = storeArg && storeArg !== 'all' ? storeArg.split(',') : null;
  const queries = queryArgs.length ? queryArgs : ['samsung galaxy a56', 'iphone 16 128gb'];

  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ load: [retailersConfig], ignoreEnvFile: true })],
    providers: [BrowserSessionService, ...CONNECTORS],
  }).compile();

  for (const type of CONNECTORS) {
    const connector = moduleRef.get<RetailerConnector>(type as never);
    if (stores && !stores.includes(connector.slug)) continue;
    for (const query of queries) {
      const started = Date.now();
      try {
        const listings = await connector.searchListings(query, 5);
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`\n[${connector.slug}] "${query}" -> ${listings.length} listing(s) in ${secs}s`);
        for (const l of listings.slice(0, 5)) {
          console.log(`   ${String(l.priceUsd).padStart(10)} ${l.currency}  ${l.title.slice(0, 80)}`);
        }
      } catch (error) {
        console.log(`\n[${connector.slug}] "${query}" -> THREW ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  await moduleRef.get(BrowserSessionService).onModuleDestroy?.();
  await moduleRef.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
