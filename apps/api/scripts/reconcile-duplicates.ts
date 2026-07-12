import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { NormalizerService } from '../src/matching/normalizer.service';
import { FuzzyMatcherService } from '../src/matching/fuzzy-matcher.service';
import { SemanticService } from '../src/matching/semantic.service';

interface ProductRow {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  attributes: Record<string, unknown>;
  categoryId: string;
  createdAt: Date;
  embedding: number[];
}

const EMBEDDING_PREFILTER = 0.80;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const normalizer = app.get(NormalizerService);
  const fuzzyMatcher = app.get(FuzzyMatcherService);
  const semantic = app.get(SemanticService);

  const categories = await prisma.category.findMany({ where: { level: { gt: 0 } } });

  let totalMerged = 0;
  let totalLlmCalls = 0;

  for (const category of categories) {
    const rows = await prisma.$queryRaw<Array<{
      id: string; title: string; brand: string | null; model: string | null;
      attributes: unknown; category_id: string; created_at: Date; embedding: string | null;
    }>>`
      SELECT id, title, brand, model, attributes, category_id, created_at, title_embedding::text as embedding
      FROM canonical_products
      WHERE category_id = ${category.id} AND title_embedding IS NOT NULL
    `;

    if (rows.length < 2) continue;

    const products: ProductRow[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      brand: r.brand,
      model: r.model,
      attributes: (r.attributes ?? {}) as Record<string, unknown>,
      categoryId: r.category_id,
      createdAt: r.created_at,
      embedding: JSON.parse(r.embedding!) as number[],
    }));

    const merged = new Set<string>();
    console.log(`\n=== ${category.name} (${products.length} products) ===`);

    for (let i = 0; i < products.length; i++) {
      const a = products[i];
      if (merged.has(a.id)) continue;

      for (let j = i + 1; j < products.length; j++) {
        const b = products[j];
        if (merged.has(b.id)) continue;

        const sim = semantic.cosineSimilarity(a.embedding, b.embedding);
        if (sim < EMBEDDING_PREFILTER) continue;

        const aBrand = a.brand?.trim().toLowerCase() ?? null;
        const bBrand = b.brand?.trim().toLowerCase() ?? null;
        if (aBrand && bBrand && aBrand !== bBrand) continue;

        if (normalizer.isAccessory(a.title) !== normalizer.isAccessory(b.title)) continue;
        if (fuzzyMatcher.detectVariantConflict(a.title, b.title)) continue;

        const aStorage = typeof a.attributes.storage === 'string' ? a.attributes.storage : undefined;
        const bStorage = typeof b.attributes.storage === 'string' ? b.attributes.storage : undefined;
        const aRam = typeof a.attributes.ram === 'string' ? a.attributes.ram : undefined;
        const bRam = typeof b.attributes.ram === 'string' ? b.attributes.ram : undefined;
        const aColor = typeof a.attributes.color === 'string' && a.attributes.color ? a.attributes.color : undefined;
        const bColor = typeof b.attributes.color === 'string' && b.attributes.color ? b.attributes.color : undefined;
        if (
          fuzzyMatcher.detectStorageConflict(aStorage, bStorage) ||
          fuzzyMatcher.detectRamConflict(aRam, bRam) ||
          fuzzyMatcher.detectColorConflict(aColor, bColor)
        ) {
          continue;
        }

        totalLlmCalls += 1;
        const verdict = await semantic.judgeSameProduct(a.title, b.title);
        if (!verdict) continue;

        // Merge b into a — keep whichever was created first as the primary,
        // so we don't rewrite watchlist/price-alert references unnecessarily.
        const [primary, duplicate] = a.createdAt <= b.createdAt ? [a, b] : [b, a];
        if (primary.id === a.id) {
          console.log(`MERGE: "${b.title.slice(0, 70)}" -> "${a.title.slice(0, 70)}" (sim=${sim.toFixed(3)})`);
        } else {
          console.log(`MERGE: "${a.title.slice(0, 70)}" -> "${b.title.slice(0, 70)}" (sim=${sim.toFixed(3)})`);
        }

        await prisma.sourceListing.updateMany({
          where: { canonicalProductId: duplicate.id },
          data: { canonicalProductId: primary.id },
        });
        await prisma.priceHistory.updateMany({
          where: { canonicalProductId: duplicate.id },
          data: { canonicalProductId: primary.id },
        });

        merged.add(duplicate.id);
        totalMerged += 1;

        if (duplicate.id === a.id) break; // a got merged away, stop comparing it further
      }
    }
  }

  console.log(`\nDone. LLM calls: ${totalLlmCalls}, merges: ${totalMerged}`);
  await app.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
