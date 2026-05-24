'use client';
import { ExternalLink, Star, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import type { SourceListing } from '@/types/product.types';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatRelativeTime, formatRating, formatNumber } from '@/lib/utils/format';
import {
  getConfidenceLevel,
  getConfidenceColor,
  getConfidenceLabel,
  isBestDeal,
} from '@/lib/utils/price';
import { cn } from '@/lib/utils/cn';

interface ListingTableProps {
  listings: SourceListing[];
  showConfidence?: boolean;
}

export function ListingTable({ listings, showConfidence = false }: ListingTableProps) {
  const allPrices = listings.map((l) => l.priceUsd ?? Infinity).filter(Number.isFinite);

  if (listings.length === 0) {
    return (
      <div className="text-center py-12 text-ink-500">
        <p>No store listings available yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-ink-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-700 bg-ink-900/50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">
              Store
            </th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">
              Price
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wider hidden sm:table-cell">
              Stock
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wider hidden md:table-cell">
              Rating
            </th>
            {showConfidence && (
              <th className="text-center px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wider hidden lg:table-cell">
                Match
              </th>
            )}
            <th className="text-right px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wider hidden lg:table-cell">
              Updated
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800">
          {listings.map((listing) => {
            const isBest = listing.priceUsd != null && isBestDeal(listing.priceUsd, allPrices);
            const confidenceLevel = getConfidenceLevel(listing.matchConfidence);

            return (
              <tr
                key={listing.id}
                className={cn(
                  'group transition-colors',
                  isBest ? 'bg-signal/5 hover:bg-signal/8' : 'hover:bg-ink-800/50',
                )}
              >
                {/* Store */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    {listing.platform.logoUrl ? (
                      <img
                        src={listing.platform.logoUrl}
                        alt={listing.platform.name}
                        className="w-5 h-5 rounded object-contain"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded bg-ink-700 flex items-center justify-center text-[10px] font-bold text-ink-400">
                        {listing.platform.name[0]}
                      </div>
                    )}
                    <span className="font-medium text-ink-200">{listing.platform.name}</span>
                    {isBest && (
                      <Badge variant="success" dot>Best Deal</Badge>
                    )}
                  </div>
                </td>

                {/* Price */}
                <td className="px-4 py-3.5 text-right">
                  <span className={cn(
                    'font-bold text-base',
                    isBest ? 'text-signal' : 'text-ink-100',
                  )}>
                    {formatCurrency(listing.priceUsd)}
                  </span>
                  {listing.rawCurrency !== 'USD' && listing.rawPrice != null && (
                    <p className="text-xs text-ink-500">
                      {listing.rawCurrency} {listing.rawPrice}
                    </p>
                  )}
                </td>

                {/* Stock */}
                <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                  {listing.inStock == null ? (
                    <span className="text-ink-600 text-xs">—</span>
                  ) : listing.inStock ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 mx-auto" />
                  )}
                </td>

                {/* Rating */}
                <td className="px-4 py-3.5 text-center hidden md:table-cell">
                  {listing.rating != null ? (
                    <div className="flex items-center justify-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span className="text-ink-300 text-xs">{formatRating(listing.rating)}</span>
                      {listing.reviewCount != null && (
                        <span className="text-ink-600 text-xs">
                          ({formatNumber(listing.reviewCount)})
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-ink-600 text-xs">—</span>
                  )}
                </td>

                {/* Confidence */}
                {showConfidence && (
                  <td className="px-4 py-3.5 text-center hidden lg:table-cell">
                    <span
                      className={cn('text-xs font-medium', getConfidenceColor(confidenceLevel))}
                      title={getConfidenceLabel(confidenceLevel)}
                    >
                      {listing.matchConfidence != null
                        ? `${(listing.matchConfidence * 100).toFixed(0)}%`
                        : '—'}
                    </span>
                  </td>
                )}

                {/* Updated */}
                <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                  <div className="flex items-center justify-end gap-1 text-xs text-ink-500">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(listing.lastSeenAt)}
                  </div>
                </td>

                {/* View link */}
                <td className="px-4 py-3.5 text-right">
                  <a
                    href={listing.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-signal border border-signal/20 hover:bg-signal/10 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
