'use client';
import { useEffect, useState } from 'react';

type TokenName = 'brand' | 'muted' | 'fg' | 'border' | 'surface' | 'info' | 'danger' | 'success';

function read(names: readonly TokenName[]): Record<TokenName, string> {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    names.map((name) => [name, `rgb(${style.getPropertyValue(`--color-${name}`).trim().split(/\s+/).join(', ')})`]),
  ) as Record<TokenName, string>;
}

/**
 * Token colors as plain rgb() strings, for libraries that take colors as SVG
 * attributes (Recharts), where CSS variables don't resolve. Re-reads when the
 * theme changes (toggle or OS setting). Null before mount.
 */
export function useThemeColors(names: readonly TokenName[]) {
  const [colors, setColors] = useState<Record<TokenName, string> | null>(null);
  const key = names.join(',');

  useEffect(() => {
    const list = key.split(',') as TokenName[];
    const update = () => setColors(read(list));
    update();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener('pl-theme-change', update);
    media.addEventListener('change', update);
    return () => {
      window.removeEventListener('pl-theme-change', update);
      media.removeEventListener('change', update);
    };
  }, [key]);

  return colors;
}
