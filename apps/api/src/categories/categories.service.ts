import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  /** Arabic name; null for a category the tree has none for. */
  nameAr: string | null;
  parentId: string | null;
  level: number;
  productCount: number;
  /** The group (level-0 parent) the category sits in, for grouped browsing. */
  groupSlug: string | null;
  groupName: string | null;
  groupNameAr: string | null;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Categories that hold at least one product, for the search filter's
   * category select (D-24) and the category links. An empty category would
   * only ever filter to "no results", so it is left out; groups hold no
   * products themselves and are described by their leaves' group fields.
   * Sorted by name; the web sorts again by its translated label.
   */
  async list(): Promise<CategorySummary[]> {
    const categories = await this.prisma.category.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        nameAr: true,
        parentId: true,
        level: true,
        parent: { select: { slug: true, name: true, nameAr: true } },
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });
    return categories
      .filter((category) => category._count.products > 0)
      .map(({ _count, parent, ...category }) => ({
        ...category,
        productCount: _count.products,
        groupSlug: parent?.slug ?? null,
        groupName: parent?.name ?? null,
        groupNameAr: parent?.nameAr ?? null,
      }));
  }
}
