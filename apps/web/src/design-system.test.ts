import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// design-tokens.js is CommonJS (tailwind.config.js requires it).
const { themes } = createRequire(import.meta.url)('../design-tokens.js') as {
  themes: Record<'light' | 'dark', Record<string, string>>;
};

/**
 * The design system's rules, checked over every source file (audit 07): no
 * colors, sizes or directions outside the token layer. Tailwind ignores
 * unknown classes silently, so without this an old `text-ink-400` would just
 * render unstyled.
 */

const SRC = join(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const RULES: Array<{ name: string; pattern: RegExp; allow?: string[] }> = [
  {
    name: 'old or default palette color',
    pattern:
      /\b(?:text|bg|border|ring|fill|stroke|from|via|to|divide|outline|accent|decoration|placeholder)-(?:ink|signal|slate|gray|zinc|neutral|stone|emerald|green|lime|red|rose|pink|amber|yellow|orange|blue|sky|cyan|teal|indigo|violet|purple|fuchsia|white|black)\b/,
  },
  { name: 'hex color', pattern: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![-\w])/ },
  { name: 'rgb()/hsl() color', pattern: /\b(?:rgba?|hsla?)\(/, allow: ['lib/hooks/use-theme-colors.ts', 'app/globals.css'] },
  // Arbitrary values (`mt-[13px]`); arbitrary variants (`aria-[invalid=true]:`) are fine.
  { name: 'arbitrary value', pattern: /\b[a-z][a-z0-9-]*-\[[^\]\s]+\](?!:)/ },
  { name: 'physical direction (use ms/me/ps/pe/start/end)', pattern: /(?<![\w-])-?(?:ml|mr|pl|pr|left|right)-(?:\d|px|auto|full)|\btext-(?:left|right)\b|\b(?:rounded|border)-(?:l|r|tl|tr|bl|br)\b/ },
  { name: 'off-scale type size', pattern: /\btext-(?:[3-9]xl)\b/ },
  { name: 'off-scale weight', pattern: /\bfont-(?:thin|extralight|light|bold|extrabold|black)\b/ },
  { name: 'off-scale radius', pattern: /\brounded-(?:lg|xl|2xl|3xl)\b/ },
  { name: 'off-grid spacing', pattern: /(?<![\w.])-?[a-z-]+-[0-3]\.5\b/ },
  // The Open Graph card is drawn by satori, which has no stylesheet: inline
  // styles, with the colors read from design-tokens.js.
  {
    name: 'inline color style',
    pattern: /style=\{\{[^}]*\b(?:color|background)/,
    allow: ['app/[locale]/products/[slug]/opengraph-image.tsx'],
  },
];

describe('design system rules', () => {
  const files = sourceFiles(SRC);

  it('scans the whole app', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  for (const rule of RULES) {
    it(`no ${rule.name}`, () => {
      const hits = files
        .filter((file) => !rule.allow?.includes(relative(SRC, file)))
        .flatMap((file) =>
          readFileSync(file, 'utf8')
            .split('\n')
            .flatMap((line, i) => (rule.pattern.test(line) ? [`${relative(SRC, file)}:${i + 1}: ${line.trim()}`] : [])),
        );
      expect(hits).toEqual([]);
    });
  }
});

/** WCAG relative luminance and contrast of two #rrggbb colors. */
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens', () => {
  it('both themes define the same tokens', () => {
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
  });

  for (const mode of ['light', 'dark'] as const) {
    const t = themes[mode];
    // Every text color on every background it is used on: 4.5:1 (WCAG AA).
    const pairs: Array<[string, string]> = [];
    for (const bg of ['bg', 'surface', 'surface-2']) {
      for (const fg of ['fg', 'muted', 'brand-text', 'success', 'warning', 'danger', 'info']) pairs.push([fg, bg]);
    }
    pairs.push(['brand-fg', 'brand'], ['brand-soft-fg', 'brand-soft'], ['fg', 'brand-soft'], ['muted', 'brand-soft'], ['brand-text', 'brand-soft'], ['accent-fg', 'accent']);
    for (const s of ['success', 'warning', 'danger', 'info']) pairs.push([s, `${s}-soft`], ['fg', `${s}-soft`]);

    it(`${mode}: text contrast is at least 4.5:1`, () => {
      const failing = pairs
        .map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(t[fg], t[bg]) }))
        .filter(({ ratio }) => ratio < 4.5)
        .map(({ pair, ratio }) => `${pair}: ${ratio.toFixed(2)}`);
      expect(failing).toEqual([]);
    });

    it(`${mode}: control borders are at least 3:1 (WCAG 1.4.11)`, () => {
      expect(contrast(t['border-strong'], t.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(t['border-strong'], t.bg)).toBeGreaterThanOrEqual(3);
    });

    it(`${mode}: brand and success are distinguishable`, () => {
      expect(t.brand.toLowerCase()).not.toEqual(t.success.toLowerCase());
      // Different hue family: success is the bluer green.
      const hue = (hex: string) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b);
        const d = max - Math.min(r, g, b);
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
      };
      expect(Math.abs(hue(t.success) - hue(t.brand))).toBeGreaterThan(40);
    });
  }
});
