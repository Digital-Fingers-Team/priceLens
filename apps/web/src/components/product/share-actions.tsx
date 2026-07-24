'use client';
import { useState } from 'react';
import { Copy, Share2, MessageCircleMore, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/lib/store/ui.store';

interface ShareActionsProps {
  title: string;
  url: string;
  summary: string;
}

export function ShareActions({ title, url, summary }: ShareActionsProps) {
  const addToast = useUiStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    addToast('Link copied', 'success');
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareNative() {
    if (navigator.share) {
      await navigator.share({ title, text: summary, url });
      return;
    }
    await copyLink();
  }

  const shareText = encodeURIComponent(`${summary}\n${url}`);

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink-100">Share this deal</h3>
          <p className="text-xs text-ink-500 mt-1">Send the price, not just the product.</p>
        </div>
        <Share2 className="w-4 h-4 text-signal" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" leftIcon={<Copy className="w-4 h-4" />} onClick={copyLink}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button variant="primary" size="sm" leftIcon={<Share2 className="w-4 h-4" />} onClick={shareNative}>
          Share
        </Button>
        <a
          href={`https://wa.me/?text=${shareText}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex"
        >
          <Button variant="ghost" size="sm" leftIcon={<MessageCircleMore className="w-4 h-4" />}>
            WhatsApp
          </Button>
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex"
        >
          <Button variant="ghost" size="sm" leftIcon={<LinkIcon className="w-4 h-4" />}>
            Social
          </Button>
        </a>
      </div>
    </div>
  );
}
