import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SemanticService } from './semantic.service';

/** Titles per AI request: the free tier limits requests per day, not titles. */
const BATCH_SIZE = 40;
const ARABIC_LETTER = /[ء-ي]/;

/**
 * Arabic product names for the Arabic site (owner, 2026-09-29). The stores
 * give English titles, so the AI translates each product's title once into
 * canonical_products.title_ar; the site falls back to the English title
 * until then. Products with the most offers go first.
 */
@Injectable()
export class TitleTranslationService {
  private readonly logger = new Logger(TitleTranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly semantic: SemanticService,
  ) {}

  /**
   * Translates up to `limit` products that have no Arabic title yet,
   * `parallel` AI requests at a time (the judge spreads them over its keys).
   */
  async translatePending(limit: number, parallel = 1): Promise<{ translated: number; failed: number }> {
    const products = await this.prisma.canonicalProduct.findMany({
      where: { titleAr: null },
      select: { id: true, title: true },
      orderBy: [{ sourceListings: { _count: 'desc' } }, { id: 'asc' }],
      take: limit,
    });

    let translated = 0;
    let failed = 0;
    const save = async (id: string, titleAr: string) => {
      await this.prisma.canonicalProduct.update({ where: { id }, data: { titleAr } });
      translated += 1;
    };

    const english: typeof products = [];
    for (const product of products) {
      if (ARABIC_LETTER.test(product.title)) await save(product.id, product.title);
      else english.push(product);
    }

    const batches: Array<typeof products> = [];
    for (let start = 0; start < english.length; start += BATCH_SIZE) batches.push(english.slice(start, start + BATCH_SIZE));
    const worker = async () => {
      for (let batch = batches.shift(); batch; batch = batches.shift()) {
        const arabic = await this.semantic.translateToArabic(batch.map((product) => product.title));
        for (const [index, product] of batch.entries()) {
          const titleAr = arabic[index];
          if (titleAr) await save(product.id, titleAr);
          else failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));

    if (products.length > 0) this.logger.log(`Arabic titles: ${translated} translated, ${failed} left for the next run`);
    return { translated, failed };
  }
}
