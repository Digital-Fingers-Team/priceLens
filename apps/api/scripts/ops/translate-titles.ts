/**
 * Backfill of Arabic product titles (TitleTranslationService). The worker
 * translates new products every 15 minutes; this catches up the catalogue.
 *
 *   ts-node scripts/ops/translate-titles.ts [--limit 40000] [--parallel 4]
 *
 * Runs in rounds of 400 until nothing is left, the limit is reached, or a
 * round translates nothing (every judge slot paused: run it again later).
 */
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import searchConfig from '../../src/config/search.config';
import { SemanticService } from '../../src/matching/semantic.service';
import { TitleTranslationService } from '../../src/matching/title-translation.service';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const semantic = new SemanticService(new ConfigService({ search: searchConfig() }), prisma as never);
    const service = new TitleTranslationService(prisma as never, semantic);
    const limit = Math.max(1, parseInt(argValue('--limit') ?? '40000', 10));
    const parallel = Math.max(1, parseInt(argValue('--parallel') ?? '4', 10));

    let total = 0;
    while (total < limit) {
      const { translated, failed } = await service.translatePending(Math.min(400, limit - total), parallel);
      total += translated;
      const left = await prisma.canonicalProduct.count({ where: { titleAr: null } });
      console.log(`${new Date().toISOString()} translated ${translated}, failed ${failed}; ${left} left`);
      if (left === 0) break;
      if (translated === 0) {
        console.log('Stopped: nothing translated this round (every judge slot paused?). Run again later.');
        break;
      }
    }
    console.log(`Done: ${total} product title(s) translated.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
