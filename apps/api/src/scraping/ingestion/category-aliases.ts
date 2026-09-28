/**
 * Extra words the free-text category resolver (pickCategoryForQuery) accepts
 * for a category, by slug: model-family names, so searches like "iphone 16"
 * or "rtx 4070" still resolve now that terms match whole words.
 *
 * These are deliberately NOT stored as the category's search_terms: site
 * search matches a query against every stored term of a category
 * (search.service categorySearchTermsMatch), so "iphone" stored on
 * smartphones would make every phone -- Samsung included -- match "iphone".
 */
export const RESOLVER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  smartphones: ['iphone', 'galaxy', 'redmi', 'pixel'],
  laptops: ['macbook', 'thinkpad'],
  'graphics-cards': ['rtx', 'geforce', 'radeon'],
  processors: ['ryzen', 'intel core'],
  headphones: ['airpods', 'galaxy buds'],
  tablets: ['galaxy tab'],
  'smart-watches': ['apple watch', 'galaxy watch'],
  'gaming-consoles': ['ps5', 'ps4'],
};
