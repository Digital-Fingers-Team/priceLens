'use client';
import { useEffect, useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore } from '@/lib/store/ui.store';

interface ShareActionsProps {
  title: string;
  /** Site path of the page (made absolute here: a copied "/products/x" was useless). */
  path: string;
  summary: string;
}

export function ShareActions({ title, path, summary }: ShareActionsProps) {
  const { t, href } = useI18n();
  const addToast = useUiStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);

  // The browser's own origin: right on every host the site is served from.
  // Known after mount; until then the share links carry the path only.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const url = () => new URL(href(path), origin || window.location.origin).toString();
  const shareUrl = origin ? url() : '';

  async function copyLink() {
    await navigator.clipboard.writeText(url());
    setCopied(true);
    addToast(t.toast.linkCopied, 'success');
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareNative() {
    if (navigator.share) {
      await navigator.share({ title, text: summary, url: url() });
      return;
    }
    await copyLink();
  }

  return (
    <section aria-labelledby="share-heading" className="flex flex-col gap-3 border-t border-border pt-8">
      <div className="flex flex-col gap-1">
        <h2 id="share-heading" className="text-base font-semibold text-fg">
          {t.share.title}
        </h2>
        <p className="text-sm text-muted">{t.share.lede}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" leftIcon={<Share2 className="h-4 w-4" aria-hidden />} onClick={shareNative}>
          {t.share.share}
        </Button>
        <Button variant="secondary" size="sm" leftIcon={<Copy className="h-4 w-4" aria-hidden />} onClick={copyLink}>
          {copied ? t.share.copied : t.share.copyLink}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${summary}\n${shareUrl}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClassName({ variant: 'ghost', size: 'sm' })}
        >
          WhatsApp
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClassName({ variant: 'ghost', size: 'sm' })}
        >
          Facebook
        </a>
      </div>
    </section>
  );
}
