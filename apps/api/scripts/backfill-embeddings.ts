import { PrismaClient } from '@prisma/client';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';

const prisma = new PrismaClient();

async function embed(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { embedding: number[] };
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch (err) {
    console.error(`  embed failed: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  const products = await prisma.$queryRaw<Array<{ id: string; title: string }>>`
    SELECT id, title FROM canonical_products WHERE title_embedding IS NULL
  `;

  console.log(`Backfilling embeddings for ${products.length} canonical products...`);

  let done = 0;
  let failed = 0;

  for (const product of products) {
    const embedding = await embed(product.title);
    if (!embedding) {
      failed += 1;
      continue;
    }

    const vectorStr = `[${embedding.join(',')}]`;
    await prisma.$executeRaw`
      UPDATE canonical_products
      SET title_embedding = ${vectorStr}::vector
      WHERE id = ${product.id}
    `;

    done += 1;
    if (done % 50 === 0) {
      console.log(`  ${done}/${products.length} embedded...`);
    }
  }

  console.log(`Done. Embedded: ${done}, failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
