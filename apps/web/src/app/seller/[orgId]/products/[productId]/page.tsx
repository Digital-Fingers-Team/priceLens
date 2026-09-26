'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, ExternalLink, Info, Link2, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PositionBadge } from '@/components/seller/position-badge';
import {
  useMatchSuggestions,
  useSellerProduct,
  useUpsertSellerProduct,
} from '@/lib/hooks/use-seller';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { safeExternalHref } from '@/lib/utils/safe-href';

export default function SellerProductPage() {
  const params = useParams<{ orgId: string; productId: string }>();
  const { orgId, productId } = params;

  const { data: product, isLoading } = useSellerProduct(orgId, productId);
  const { mutate: upsert, isPending: saving } = useUpsertSellerProduct(orgId);
  const [showMatches, setShowMatches] = useState(false);
  const { data: suggestions, isLoading: suggestionsLoading } = useMatchSuggestions(
    orgId,
    productId,
    showMatches,
  );

  const [form, setForm] = useState<{ cost: string; price: string; target: string; min: string } | null>(null);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center text-sm text-ink-400">
        Product not found in this workspace.
      </div>
    );
  }

  const fields = form ?? {
    cost: product.cost?.toString() ?? '',
    price: product.currentPrice?.toString() ?? '',
    target: product.targetMarginPct?.toString() ?? '',
    min: product.minMarginPct?.toString() ?? '',
  };

  const save = () =>
    upsert({
      id: product.id,
      sku: product.sku,
      name: product.name,
      canonicalProductId: product.canonicalProductId,
      cost: fields.cost === '' ? null : Number(fields.cost),
      currentPrice: fields.price === '' ? null : Number(fields.price),
      targetMarginPct: fields.target === '' ? null : Number(fields.target),
      minMarginPct: fields.min === '' ? null : Number(fields.min),
    });

  const rec = product.recommendation;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <Link
        href={`/seller/${orgId}`}
        className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to workspace
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-50">{product.name}</h1>
          <p className="mt-1 font-mono text-xs text-ink-500">{product.sku}</p>
        </div>
        <PositionBadge label={product.position.label} />
      </header>

      {/* Mapping is the precondition for everything else, so an unmapped
          product leads with that rather than showing empty analytics. */}
      {!product.canonicalProductId && (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-start gap-2.5">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
              <div>
                <h2 className="text-sm font-semibold text-amber-300">Not mapped yet</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-400">
                  Competitor prices come from our catalogue. Match this SKU to a catalogue product to
                  start monitoring it.
                </p>
              </div>
            </div>

            {!showMatches ? (
              <Button variant="ghost" onClick={() => setShowMatches(true)}>
                Find matches
              </Button>
            ) : suggestionsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !suggestions || suggestions.length === 0 ? (
              <p className="text-sm text-ink-500">
                No confident matches. We may not track this product yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {suggestions.map((suggestion) => (
                  <li
                    key={suggestion.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-950/50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink-200">{suggestion.title}</p>
                      <p className="text-xs text-ink-500">{suggestion.confidence}% similar</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<Check className="h-3.5 w-3.5" />}
                      onClick={() =>
                        upsert({
                          id: product.id,
                          sku: product.sku,
                          name: product.name,
                          canonicalProductId: suggestion.id,
                        })
                      }
                    >
                      Map
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-ink-100">Market position</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-300">{product.position.explanation}</p>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Your price" value={formatCurrency(product.position.ourPrice, product.currency)} emphasis />
              <Metric label="Cheapest" value={formatCurrency(product.position.lowest, product.currency)} />
              <Metric label="Median" value={formatCurrency(product.position.marketMedian, product.currency)} />
              <Metric label="Highest" value={formatCurrency(product.position.highest, product.currency)} />
            </dl>

            {product.competitors.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-800 text-left text-xs text-ink-500">
                      <th className="py-2 font-medium">Store</th>
                      <th className="py-2 text-right font-medium">Price</th>
                      <th className="py-2 text-right font-medium">Stock</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {product.competitors.map((competitor) => (
                      <tr key={competitor.platformId} className="border-b border-ink-800/60 last:border-0">
                        <td className="py-2 text-ink-200">{competitor.platformName}</td>
                        <td className="py-2 text-right tabular-nums text-ink-100">
                          {formatCurrency(competitor.price, product.currency)}
                        </td>
                        <td className="py-2 text-right text-xs">
                          {competitor.inStock === null ? (
                            <span className="text-ink-600">unknown</span>
                          ) : competitor.inStock ? (
                            <span className="text-emerald-400">in stock</span>
                          ) : (
                            <span className="text-red-400">out</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {safeExternalHref(competitor.url) && (
                            <a
                              href={safeExternalHref(competitor.url)}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="text-ink-500 hover:text-ink-300"
                              aria-label={`Open ${competitor.platformName} listing`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-ink-100">Your numbers</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <Field label={`Unit cost (${product.currency})`} value={fields.cost} onChange={(v) => setForm({ ...fields, cost: v })} />
            <Field label={`Your price (${product.currency})`} value={fields.price} onChange={(v) => setForm({ ...fields, price: v })} />
            <Field label="Target margin %" value={fields.target} onChange={(v) => setForm({ ...fields, target: v })} />
            <Field label="Minimum margin %" value={fields.min} onChange={(v) => setForm({ ...fields, min: v })} />
            <Button className="w-full" loading={saving} onClick={save}>
              Save
            </Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-signal" aria-hidden />
            <h2 className="text-sm font-semibold text-ink-100">Pricing recommendation</h2>
          </div>
          {rec.confidence !== 'NONE' && (
            <Badge variant={rec.confidence === 'HIGH' ? 'success' : rec.confidence === 'MEDIUM' ? 'info' : 'outline'}>
              {rec.confidence.toLowerCase()} confidence
            </Badge>
          )}
        </CardHeader>
        <CardBody className="space-y-4">
          {rec.recommendedPrice == null ? (
            <p className="text-sm text-ink-400">{rec.rationale[0] ?? 'Not enough information yet.'}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <div>
                  <p className="text-xs text-ink-500">Recommended</p>
                  <p className="text-2xl font-bold tabular-nums text-signal">
                    {formatCurrency(rec.recommendedPrice, product.currency)}
                  </p>
                </div>
                <Metric label="Minimum profitable" value={formatCurrency(rec.floorPrice, product.currency)} />
                <Metric label="Target margin price" value={formatCurrency(rec.targetPrice, product.currency)} />
                <Metric
                  label="Resulting margin"
                  value={rec.projectedMarginPct != null ? `${rec.projectedMarginPct.toFixed(1)}%` : '—'}
                />
                <Metric
                  label="Current margin"
                  value={rec.currentMarginPct != null ? `${rec.currentMarginPct.toFixed(1)}%` : '—'}
                />
              </div>

              <ul className="space-y-1.5">
                {rec.rationale.map((reason) => (
                  <li key={reason} className="flex gap-2 text-sm leading-relaxed text-ink-400">
                    <span aria-hidden className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-ink-600" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Always shown, never collapsed: a pricing suggestion presented as
              certainty is how a seller loses money and blames the tool. */}
          <p className="flex items-start gap-2 rounded-lg bg-ink-950/60 p-3 text-xs leading-relaxed text-ink-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {rec.caveat}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-semibold tabular-nums', emphasis ? 'text-ink-50' : 'text-ink-300')}>
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-ink-500">{label}</span>
      <Input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1"
      />
    </label>
  );
}
