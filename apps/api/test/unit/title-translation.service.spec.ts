import { TitleTranslationService } from '../../src/matching/title-translation.service';

/** Owner, 2026-09-29: the Arabic site showed every product name in English. */
function setup(products: Array<{ id: string; title: string }>, translate: (titles: string[]) => Array<string | null>) {
  const saved = new Map<string, string>();
  const prisma = {
    canonicalProduct: {
      findMany: jest.fn(async ({ take }: { take: number }) => products.filter((p) => !saved.has(p.id)).slice(0, take)),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { titleAr: string } }) => {
        saved.set(where.id, data.titleAr);
      }),
    },
  };
  const asked: string[][] = [];
  const semantic = {
    translateToArabic: jest.fn(async (titles: string[]) => {
      asked.push(titles);
      return translate(titles);
    }),
  };
  return { service: new TitleTranslationService(prisma as never, semantic as never), saved, asked };
}

describe('TitleTranslationService', () => {
  it('translates products without an Arabic title, in batches of 40 (the free quota counts requests)', async () => {
    const products = Array.from({ length: 45 }, (_, i) => ({ id: `p${i}`, title: `Product ${i}` }));
    const { service, saved, asked } = setup(products, (titles) => titles.map((t) => `منتج ${t.split(' ')[1]}`));

    expect(await service.translatePending(100)).toEqual({ translated: 45, failed: 0 });
    expect(asked.map((batch) => batch.length)).toEqual([40, 5]);
    expect(saved.get('p7')).toBe('منتج 7');
  });

  it('keeps a title that is already Arabic without asking', async () => {
    const { service, saved, asked } = setup([{ id: 'a', title: 'غسالة توشيبا 8 كيلو' }], () => []);

    expect(await service.translatePending(10)).toEqual({ translated: 1, failed: 0 });
    expect(saved.get('a')).toBe('غسالة توشيبا 8 كيلو');
    expect(asked).toEqual([]);
  });

  it('leaves a title the AI could not translate for the next run', async () => {
    const { service, saved } = setup(
      [
        { id: 'x', title: 'One' },
        { id: 'y', title: 'Two' },
      ],
      () => ['واحد', null],
    );

    expect(await service.translatePending(10)).toEqual({ translated: 1, failed: 1 });
    expect(saved.has('y')).toBe(false);
  });
});
