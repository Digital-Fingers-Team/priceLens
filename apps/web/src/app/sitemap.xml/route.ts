import { indexXml, productFileCount, xmlResponse } from '@/lib/sitemap';

// The sitemap index (see lib/sitemap): the pages file and one file per
// PRODUCTS_PER_FILE products. Built per request (one count query): built at
// build time, when the API may be unreachable, it would list one product
// file until the next revalidation.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const products = await productFileCount();
  const files = ['pages.xml', ...Array.from({ length: products }, (_, i) => `products-${i + 1}.xml`)];
  return xmlResponse(indexXml(files));
}
