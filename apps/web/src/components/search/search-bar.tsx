'use client';
import { productTitle } from '@/lib/product-title';
import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useSuggest } from '@/lib/hooks/use-search';
import { useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import { useDebounce } from '@/lib/hooks/use-debounce';

interface SearchBarProps {
  initialValue?: string;
  size?: 'default' | 'hero';
  onSearch?: (query: string) => void;
  className?: string;
}

/** The search field is the brand's one pill ("bubble") shape. */
export function SearchBar({ initialValue = '', size = 'default', onSearch, className }: SearchBarProps) {
  const router = useRouter();
  const { t, href, locale } = useI18n();
  const [query, setQuery] = useState(initialValue);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Back/forward on /search changes the query in the URL without remounting
  // this component; keep the box showing what the results are for -- unless
  // the user has typed since. An earlier search that lands late must not
  // overwrite the next one being typed or just submitted (audit 11: three
  // quick searches ended on the second).
  const [syncedValue, setSyncedValue] = useState(initialValue);
  if (initialValue !== syncedValue) {
    setSyncedValue(initialValue);
    if (query.trim() === syncedValue.trim()) setQuery(initialValue);
  }

  const debouncedQuery = useDebounce(query, 220);
  const { data: suggestions = [], isFetching } = useSuggest(debouncedQuery);

  const showDropdown = isOpen && query.length >= 2 && (isFetching || suggestions.length > 0);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setIsOpen(false);
    if (onSearch) {
      onSearch(q);
    } else {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  }

  function handleSuggestionClick(title: string, slug: string) {
    setQuery(title);
    setIsOpen(false);
    router.push(`/products/${slug}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && highlightedIdx >= 0) {
      e.preventDefault();
      const s = suggestions[highlightedIdx];
      handleSuggestionClick(s.title, s.slug);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isHero = size === 'hero';

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* action + name: a submit before the bundle hydrates (slow phone) is a
          plain GET to /search?q=... instead of reloading this page (FE-04). */}
      <form action={href('/search')} role="search" onSubmit={handleSubmit}>
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute start-4 h-4 w-4 text-muted" aria-hidden />

          <input
            ref={inputRef}
            type="search"
            name="q"
            aria-label={t.search.label}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
              setHighlightedIdx(-1);
            }}
            onFocus={() => query.length >= 2 && setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={t.search.placeholder}
            autoComplete="off"
            className={cn(
              // plaintext: a Latin query in the Arabic UI reads left-to-right, but the
              // padding keeps following the page, so the text clears the buttons.
              'w-full rounded-full border border-border-strong bg-surface [unicode-bidi:plaintext] text-fg transition-colors placeholder:text-muted',
              'hover:border-fg/60 focus-visible:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand/40',
              // Room for the clear and submit buttons at the end.
              isHero ? 'h-12 pe-24 ps-11 text-base' : 'h-10 pe-20 ps-11 text-sm',
            )}
          />

          {query && (
            <button
              type="button"
              aria-label={t.search.clear}
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className={cn(
                'absolute flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-fg',
                isHero ? 'end-12' : 'end-10',
              )}
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <button
            type="submit"
            aria-label={t.search.submit}
            className={cn(
              'absolute flex items-center justify-center rounded-full bg-brand text-brand-fg transition-colors hover:bg-brand-hover',
              isHero ? 'end-2 h-8 w-8' : 'end-1 h-8 w-8',
            )}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </form>

      {showDropdown && (
        <div className="glass absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded border shadow">
          {isFetching && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
              <Spinner />
              {t.search.searching}
            </div>
          ) : (
            <ul>
              {suggestions.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSuggestionClick(s.title, s.slug)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-start text-sm transition-colors',
                      i === highlightedIdx ? 'bg-surface-2 text-fg' : 'text-fg hover:bg-surface-2',
                    )}
                  >
                    <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="flex flex-col gap-1">
                      <span className="font-medium" dir="auto">
                        {productTitle(s, locale)}
                      </span>
                      {s.brand && <span className="text-xs text-muted">{s.brand}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
