// The same card for Twitter/X (audit 09, SEO-10). Route config must be
// declared here, not re-exported: Next reads it statically.
export { default, alt, size, contentType } from './opengraph-image';
export const revalidate = 3600;
