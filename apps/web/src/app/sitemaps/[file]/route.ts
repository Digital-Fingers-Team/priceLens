import { pageEntries, productEntries, urlsetXml, xmlResponse } from '@/lib/sitemap';

// One file of the sitemap index (see lib/sitemap), built on first request
// and cached for six hours.
export const revalidate = 21600;

const PRODUCT_FILE = /^products-([1-9]\d{0,3})\.xml$/;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  if (file === 'pages.xml') return xmlResponse(urlsetXml(await pageEntries()));
  const product = PRODUCT_FILE.exec(file);
  if (!product) return new Response('Not found', { status: 404 });
  return xmlResponse(urlsetXml(await productEntries(Number(product[1]))));
}
