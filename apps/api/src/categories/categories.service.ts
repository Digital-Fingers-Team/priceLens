import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  level: number;
  productCount: number;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Categories that hold at least one product, for the search filter's
   * category select (D-24). An empty category would only ever filter to
   * "no results", so it is left out. Sorted by name; the web sorts again by
   * its translated label.
   */
  async list(): Promise<CategorySummary[]> {
    const categories = await this.prisma.category.findMany({
      select: { id: true, slug: true, name: true, parentId: true, level: true, _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    return categories
      .filter((category) => category._count.products > 0)
      .map(({ _count, ...category }) => ({ ...category, productCount: _count.products }));
  }
}
