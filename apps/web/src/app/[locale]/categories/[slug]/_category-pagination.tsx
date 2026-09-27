'use client';
import { Pagination } from '@/components/ui/pagination';

/** Pagination builds hrefs with a function, which a server page cannot pass. */
export function CategoryPagination({ slug, page, totalPages }: { slug: string; page: number; totalPages: number }) {
  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      hrefFor={(p) => (p > 1 ? `/categories/${slug}?page=${p}` : `/categories/${slug}`)}
      className="border-t border-border pt-6"
    />
  );
}
