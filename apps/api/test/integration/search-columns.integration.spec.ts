import { Prisma, PrismaClient } from '@prisma/client';
import { normalizedTextSql } from '../../src/search/search-text';

/**
 * search_title and search_text are generated columns (audit 08, P-01): the
 * migration repeats normalizedTextSql() as SQL, because a generated column
 * cannot call application code. This keeps the two in step: for titles with
 * every character class the normalizer touches, the stored columns must equal
 * normalizedTextSql() over the same fields, computed at query time.
 *
 * Requires DATABASE_URL pointing at a migrated database.
 */
describe('search text columns (integration)', () => {
  const run = `searchcols-${Date.now().toString(36)}`;
  const ch = (...codes: number[]) => String.fromCharCode(...codes);
  let prisma: PrismaClient;
  let categoryId: string;

  // Built from code points: this toolchain has reordered Arabic literals.
  const arabicTitle = [
    ch(0x623, 0x62c, 0x647, 0x632, 0x629), // hamza-on-alef ... taa marbuta
    ch(0x625, 0x622, 0x671, 0x649), // hamza-below, madda, wasla, alef maqsura
    ch(0x624, 0x626), // waw and yeh with hamza
    ch(0x660, 0x662, 0x665, 0x666), // Arabic-Indic digits
    ch(0x6f1, 0x6f2), // Persian digits
    ch(0x633, 0x64e, 0x627, 0x645, 0x652, 0x633, 0x640, 0x648, 0x646, 0x670, 0x62c, 0x65f), // diacritics, tatweel
    'Galaxy S24',
  ].join(' ');

  const products = [
    { title: 'Samsung Galaxy S24 Ultra 256GB', brand: 'Samsung', model: 'S24 Ultra' },
    { title: arabicTitle, brand: null, model: null },
    { title: arabicTitle, brand: ch(0x633, 0x627, 0x645, 0x633, 0x648, 0x646, 0x62c), model: null },
    { title: 'Apple iPhone 15 Pro', brand: null, model: 'A3102' },
  ];

  beforeAll(async () => {
    prisma = new PrismaClient();
    const category = await prisma.category.create({
      data: { slug: `${run}-cat`, name: `Search columns ${run}`, searchTerms: [] },
    });
    categoryId = category.id;
    for (const [index, product] of products.entries()) {
      await prisma.canonicalProduct.create({
        data: {
          categoryId,
          slug: `${run}-${index}`,
          title: product.title,
          normalizedTitle: product.title.toLowerCase(),
          brand: product.brand,
          model: product.model,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.canonicalProduct.deleteMany({ where: { categoryId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('stores exactly what normalizedTextSql computes, for title and for title+brand+model+slug', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ slug: string; searchTitle: string; wantTitle: string; searchText: string; wantText: string }>
    >(Prisma.sql`
      SELECT cp.slug,
        cp.search_title AS "searchTitle",
        ${normalizedTextSql(Prisma.sql`cp.title`)} AS "wantTitle",
        cp.search_text AS "searchText",
        ${normalizedTextSql(Prisma.sql`concat_ws(' ', cp.title, cp.brand, cp.model, cp.slug)`)} AS "wantText"
      FROM canonical_products cp
      WHERE cp.category_id = ${categoryId}
      ORDER BY cp.slug
    `);

    expect(rows).toHaveLength(products.length);
    for (const row of rows) {
      expect(row.searchTitle).toBe(row.wantTitle);
      expect(row.searchText).toBe(row.wantText);
    }
    // The normalizer really ran: no hamza forms, Arabic-Indic digits or
    // diacritics are left in the stored Arabic title.
    const arabic = rows.find((row) => row.slug === `${run}-1`)!;
    const leftovers = new RegExp(`[${ch(0x623, 0x625, 0x622, 0x671, 0x649, 0x629)}${ch(0x660)}-${ch(0x669)}${ch(0x64b)}-${ch(0x65f)}${ch(0x670, 0x640)}]`);
    expect(arabic.searchTitle).not.toMatch(leftovers);
    expect(arabic.searchTitle).toContain('0256');
    expect(arabic.searchText.endsWith(` ${run}-1`)).toBe(true);
  });

  it('follows a title edit (the column is regenerated on update)', async () => {
    const product = await prisma.canonicalProduct.findFirstOrThrow({ where: { slug: `${run}-0` } });
    await prisma.canonicalProduct.update({ where: { id: product.id }, data: { title: 'Samsung Galaxy S25' } });
    const [row] = await prisma.$queryRaw<Array<{ searchTitle: string }>>(
      Prisma.sql`SELECT search_title AS "searchTitle" FROM canonical_products WHERE id = ${product.id}`,
    );
    expect(row.searchTitle).toBe('samsung galaxy s25');
  });
});
