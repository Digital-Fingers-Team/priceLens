'use client';
import { localizePath } from '@/lib/i18n/config';
import { usePathname } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { buttonClassName } from '@/components/ui/button-styles';
import { cn } from '@/lib/utils/cn';

/**
 * Same page in the other language. The href has no query string (reading
 * it with useSearchParams would opt static pages out of prerendering); a
 * normal click carries the current query over.
 */
export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const path = usePathname();
  const other = locale === 'ar' ? 'en' : 'ar';
  const href = localizePath(other, path);

  return (
    <a
      href={href}
      hrefLang={other}
      lang={other}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        window.location.assign(href + window.location.search);
      }}
      className={cn(buttonClassName({ variant: 'ghost', size: 'sm' }), 'normal-case tracking-normal', className)}
    >
      {t.nav.otherLanguage}
    </a>
  );
}
