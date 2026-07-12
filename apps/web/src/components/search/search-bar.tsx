'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { useSuggest } from '@/lib/hooks/use-search';
import { cn } from '@/lib/utils/cn';
import { useDebounce } from '@/lib/hooks/use-debounce';

interface SearchBarProps {
  initialValue?: string;
  size?: 'default' | 'hero';
  onSearch?: (query: string) => void;
  className?: string;
}

export function SearchBar({
  initialValue = '',
  size = 'default',
  onSearch,
  className,
}: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialValue);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      <form onSubmit={handleSubmit}>
        <div className="relative flex items-center">
          <Search
            className={cn(
              'absolute left-4 text-ink-500 pointer-events-none',
              isHero ? 'w-5 h-5' : 'w-4 h-4',
            )}
          />

          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
              setHighlightedIdx(-1);
            }}
            onFocus={() => query.length >= 2 && setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search products, brands, models..."
            autoComplete="off"
            className={cn(
              'w-full rounded-xl border bg-ink-800 text-ink-100',
              'placeholder:text-ink-500 transition-all duration-150',
              'focus:outline-none focus:border-signal/60 focus:ring-2 focus:ring-signal/15',
              'border-ink-600',
              isHero ? 'h-14 pl-12 pr-14 text-base' : 'h-10 pl-10 pr-10 text-sm',
            )}
          />

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className={cn(
                'absolute text-ink-500 hover:text-ink-300 transition-colors',
                'focus-visible:outline-none focus-visible:text-ink-200',
                isHero ? 'right-14' : 'right-10',
              )}
            >
              <X className={isHero ? 'w-5 h-5' : 'w-4 h-4'} />
            </button>
          )}

          <button
            type="submit"
            aria-label="Search"
            className={cn(
              'absolute right-2 flex items-center justify-center rounded-lg',
              'bg-signal text-ink-950 font-semibold',
              'hover:bg-signal-dim transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50',
              isHero ? 'h-10 w-10' : 'h-6 w-6',
            )}
          >
            <Search className={isHero ? 'w-4 h-4' : 'w-3 h-3'} />
          </button>
        </div>
      </form>

      {showDropdown && (
        <div className="absolute top-full mt-2 left-0 right-0 z-50 rounded-xl border border-ink-700 bg-ink-900 shadow-2xl overflow-hidden">
          {isFetching && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-ink-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
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
                      'w-full flex items-center gap-3 px-4 py-3 text-left',
                      'text-sm transition-colors',
                      i === highlightedIdx
                        ? 'bg-ink-700 text-ink-50'
                        : 'text-ink-200 hover:bg-ink-800',
                    )}
                  >
                    <Search className="w-3.5 h-3.5 text-ink-500 shrink-0" />
                    <div>
                      <p className="font-medium">{s.title}</p>
                      {s.brand && <p className="text-xs text-ink-500 mt-0.5">{s.brand}</p>}
                    </div>
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
