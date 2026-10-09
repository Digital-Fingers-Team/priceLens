/**
 * Reading data a Next.js App Router page streams into its HTML: every
 * `self.__next_f.push([1,"..."])` string. Stores whose search API refuses us
 * (B.TECH, Sigma) still render their first page of results on their own
 * servers and ship it this way.
 */

/** The streamed page data: every `self.__next_f.push([1,"..."])` string, joined. */
export function streamedText(html: string): string {
  const chunk = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let text = '';
  for (let match = chunk.exec(html); match; match = chunk.exec(html)) {
    try {
      text += JSON.parse(match[1]) as string;
    } catch {
      // A chunk that isn't a plain string literal carries no results.
    }
  }
  return text;
}

/** The first JSON array under `"<key>":[` in `text`, or [] when there is none or it doesn't parse. */
export function firstJsonArray<T>(text: string, key: string): T[] {
  const marker = `"${key}":[`;
  const start = text.indexOf(marker);
  if (start < 0) return [];
  const open = start + marker.length - 1;
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const items = JSON.parse(text.slice(open, i + 1)) as unknown;
          return Array.isArray(items) ? (items as T[]) : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}
