/**
 * Serializes structured data for a `<script type="application/ld+json">` tag.
 *
 * `JSON.stringify` leaves `<` alone, so a scraped title containing
 * `</script><script>…` would close the tag and run as code. Escaping `<`, `>`
 * and `&` as \u sequences keeps the output valid JSON that the HTML parser
 * can never read as markup. U+2028/U+2029 are escaped too: they are legal in
 * JSON but line terminators in older JavaScript parsers.
 */
const LINE_SEPARATORS = String.fromCharCode(0x2028, 0x2029);
const UNSAFE = new RegExp(`[<>&${LINE_SEPARATORS}]`, 'g');

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(
    UNSAFE,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
