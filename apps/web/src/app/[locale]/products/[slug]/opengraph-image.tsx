import { ImageResponse } from 'next/og';
import { productApi } from '@/lib/api/product.api';
import { getI18n } from '@/lib/i18n/server';
import designTokens from '../../../../../design-tokens';

/**
 * The card a shared product link shows (audit 09, SEO-10): brand, title,
 * lowest price and store count, 1200x630. It replaced the store's 300x300
 * thumbnail, which social sites stretched or cropped. English text: the
 * bundled font has no Arabic glyphs, and product titles are English.
 */
export const alt = 'Pricelens price comparison';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;

// The card is drawn without CSS (satori), so the tokens are read directly.
const { moss } = designTokens;
const MOSS = { bg: moss[900], panel: moss[800], accent: moss[200], fg: moss[50], muted: moss[300] };

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t, tp, fmt } = getI18n('en');
  let product = null;
  try {
    product = await productApi.getBySlug(slug);
  } catch {
    product = null;
  }

  const title = product?.title ?? 'Pricelens';
  const min = product?.priceStats.min ?? null;
  const stores = product ? new Set((product.sourceListings ?? []).map((l) => l.platform.id)).size : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          background: MOSS.bg,
          color: MOSS.fg,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 600, color: MOSS.accent }}>Pricelens</div>
        <div style={{ display: 'flex', fontSize: title.length > 70 ? 48 : 60, fontWeight: 600, lineHeight: 1.15 }}>
          {title.length > 110 ? `${title.slice(0, 107)}…` : title}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {min != null ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 28, color: MOSS.muted }}>{t.seo.ogFrom}</div>
              <div style={{ display: 'flex', fontSize: 72, fontWeight: 700 }}>
                {fmt.currency(min, product?.priceStats.currency)}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex' }} />
          )}
          {stores > 0 && (
            <div style={{ display: 'flex', padding: '12px 24px', background: MOSS.panel, fontSize: 30, color: MOSS.accent }}>
              {tp(t.seo.ogStores, stores)}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
