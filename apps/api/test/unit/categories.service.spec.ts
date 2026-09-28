import { CategoriesService } from '../../src/categories/categories.service';

describe('CategoriesService.list', () => {
  const rows = [
    {
      id: 'c-fridge',
      slug: 'refrigerators',
      name: 'Refrigerators',
      nameAr: 'ثلاجات',
      parentId: 'g-large',
      level: 1,
      parent: { slug: 'large-appliances', name: 'Large Appliances', nameAr: 'أجهزة منزلية كبيرة' },
      _count: { products: 12 },
    },
    {
      id: 'c-sofa',
      slug: 'sofas',
      name: 'Sofas',
      nameAr: 'كنب',
      parentId: 'g-furniture',
      level: 1,
      parent: { slug: 'furniture', name: 'Furniture', nameAr: 'أثاث' },
      _count: { products: 0 },
    },
    { id: 'g-large', slug: 'large-appliances', name: 'Large Appliances', nameAr: null, parentId: null, level: 0, parent: null, _count: { products: 0 } },
  ];
  const prisma = { category: { findMany: jest.fn(async () => rows) } };
  const service = new CategoriesService(prisma as never);

  it('returns categories with products, with their Arabic name and group', async () => {
    expect(await service.list()).toEqual([
      {
        id: 'c-fridge',
        slug: 'refrigerators',
        name: 'Refrigerators',
        nameAr: 'ثلاجات',
        parentId: 'g-large',
        level: 1,
        productCount: 12,
        groupSlug: 'large-appliances',
        groupName: 'Large Appliances',
        groupNameAr: 'أجهزة منزلية كبيرة',
      },
    ]);
  });
});
