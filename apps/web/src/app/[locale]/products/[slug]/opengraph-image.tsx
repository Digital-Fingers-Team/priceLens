import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { CSSProperties } from 'react';
import { productApi } from '@/lib/api/product.api';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';
import { productTitle } from '@/lib/product-title';
import designTokens from '../../../../../design-tokens';

/**
 * The card a shared product link shows (audit 09, SEO-10): brand, title,
 * lowest price and store count, 1200x630. It replaced the store's 300x300
 * thumbnail, which social sites stretched or cropped. Drawn in the page's
 * language with IBM Plex Sans Arabic (the site's Arabic face, which also has
 * Latin letters), read from apps/web/assets/og.
 */
export const alt = 'Pricelens price comparison';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;

// The card is drawn without CSS (satori), so the tokens are read directly.
const { moss } = designTokens;
const MOSS = { bg: moss[900], panel: moss[800], accent: moss[200], fg: moss[50], muted: moss[300] };

// Loaded once per server process. The server runs from apps/web.
let fonts: Promise<{ name: string; data: Buffer; weight: 600 | 700; style: 'normal' }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    ([600, 700] as const).map(async (weight) => ({
      name: 'Plex',
      data: await readFile(
        join(process.cwd(), 'assets/og', `IBMPlexSansArabic-${weight === 600 ? 'SemiBold' : 'Bold'}.ttf`),
      ),
      weight,
      style: 'normal' as const,
    })),
  );
  return fonts;
}

// Satori shapes and orders the letters inside a word but not the words in a
// line, so an Arabic line is split into words laid out in a row-reverse flex
// box. Runs of Latin words ("Galaxy A57") keep their left-to-right order.
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
const BIDI_MARKS = /[\u200E\u200F\u061C]/g;

/** An RTL line's words in the DOM order a row-reverse box displays correctly. */
function rtlWords(text: string): string[] {
  const words = text.replace(BIDI_MARKS, '').split(/\s+/).filter(Boolean);
  const kind = words.map((w) => (ARABIC.test(w) ? 'r' : LATIN_OR_DIGIT.test(w) ? 'l' : 'n'));
  // Punctuation between two Latin words belongs to their run ("A57 - 5G").
  kind.forEach((k, i) => {
    if (k === 'n' && kind[i - 1] === 'l' && kind[i + 1] === 'l') kind[i] = 'l';
  });
  const out: string[] = [];
  let run: string[] = [];
  words.forEach((w, i) => {
    if (kind[i] === 'l') {
      run.push(w);
    } else {
      out.push(...run.reverse(), w);
      run = [];
    }
  });
  out.push(...run.reverse());
  return out;
}

function Line({ text, rtl, style }: { text: string; rtl: boolean; style: CSSProperties }) {
  if (!rtl) return <div style={{ display: 'flex', ...style }}>{text}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'row-reverse', flexWrap: 'wrap', ...style }}>
      {rtlWords(text).map((w, i) => (
        <div key={i} style={{ display: 'flex', marginLeft: i === 0 ? 0 : '0.25em' }}>
          {w}
        </div>
      ))}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'ar';
  const { t, tp, fmt, dir } = getI18n(locale);
  let product = null;
  try {
    product = await productApi.getBySlug(slug);
  } catch {
    product = null;
  }

  const title = product ? productTitle(product, locale) : 'Pricelens';
  const min = product?.priceStats.min ?? null;
  const stores = product ? new Set((product.sourceListings ?? []).map((l) => l.platform.id)).size : 0;
  // Right-aligned for Arabic; satori lays rows out left to right either way.
  const rtl = dir === 'rtl';
  const row = rtl ? 'row-reverse' : 'row';
  const align = rtl ? 'flex-end' : 'flex-start';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: align,
          padding: 64,
          background: MOSS.bg,
          color: MOSS.fg,
          fontFamily: 'Plex',
        }}
      >
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 600, color: MOSS.accent }}>Pricelens</div>
        <Line
          text={title.length > 110 ? `${title.slice(0, 107)}…` : title}
          rtl={rtl}
          style={{ fontSize: title.length > 70 ? 48 : 60, fontWeight: 600, lineHeight: 1.3, width: '100%' }}
        />
        <div style={{ display: 'flex', flexDirection: row, alignItems: 'flex-end', justifyContent: 'space-between', width: '100%' }}>
          {min != null ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: align }}>
              <Line text={t.seo.ogFrom} rtl={rtl} style={{ fontSize: 28, color: MOSS.muted }} />
              <Line text={fmt.currency(min, product?.priceStats.currency)} rtl={rtl} style={{ fontSize: 72, fontWeight: 700 }} />
            </div>
          ) : (
            <div style={{ display: 'flex' }} />
          )}
          {stores > 0 && (
            <Line
              text={tp(t.seo.ogStores, stores)}
              rtl={rtl}
              style={{ padding: '12px 24px', background: MOSS.panel, fontSize: 30, color: MOSS.accent }}
            />
          )}
        </div>
      </div>
    ),
    { ...size, fonts: await loadFonts() },
  );
}
