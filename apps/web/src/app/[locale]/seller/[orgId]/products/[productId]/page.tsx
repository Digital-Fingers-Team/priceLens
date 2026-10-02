'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, ExternalLink, Info } from 'lucide-react';
import { PositionBadge } from '@/components/seller/position-badge';
import { SellerTools } from '@/components/seller/seller-tools';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, Td, Th, THead } from '@/components/ui/table';
import { useMatchSuggestions, useSellerProduct, useUpsertSellerProduct } from '@/lib/hooks/use-seller';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import { formatSignedPercent } from '@/lib/utils/format';
import { safeExternalHref } from '@/lib/utils/safe-href';

const CONFIDENCE: Record<string, BadgeVariant> = { HIGH: 'success', MEDIUM: 'info', LOW: 'outline' };

export default function SellerProductPage() {
  const { t, tf, fmt } = useI18n();
  const params = useParams<{ orgId: string; productId: string }>();
  const { orgId, productId } = params;

  const { data: product, isLoading } = useSellerProduct(orgId, productId);
  const { mutate: upsert, isPending: saving } = useUpsertSellerProduct(orgId);
  const [showMatches, setShowMatches] = useState(false);
  const { data: suggestions, isLoading: suggestionsLoading } = useMatchSuggestions(orgId, productId, showMatches);

  const [form, setForm] = useState<{ cost: string; price: string; target: string; min: string } | null>(null);

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState title={t.seller.productNotFound} />
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
  const currency = product.currency;
  const numberField = (label: string, key: keyof typeof fields) => (
    <Input
      label={label}
      type="number"
      inputMode="decimal"
      dir="ltr"
      min="0"
      step="0.01"
      value={fields[key]}
      onChange={(event) => setForm({ ...fields, [key]: event.target.value })}
    />
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href={`/seller/${orgId}`} className="inline-flex items-center gap-1 self-start text-sm text-muted hover:text-fg">
        <ArrowLeft className="flip-rtl h-4 w-4" aria-hidden />
        {t.seller.backToWorkspace}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-fg" dir="auto">
            {product.name}
          </h1>
          <p className="font-mono text-xs text-muted" dir="ltr">
            {product.sku}
          </p>
        </div>
        <PositionBadge label={product.position.label} />
      </header>

      {/* Mapping is the precondition for everything else, so an unmapped
          product leads with that rather than showing empty analytics. */}
      {!product.canonicalProductId && (
        <div className="flex flex-col gap-3 rounded border border-warning/40 bg-warning-soft p-4 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-fg">{t.seller.notMappedTitle}</h2>
            <p className="text-sm text-muted">{t.seller.notMappedBody}</p>
          </div>
          {!showMatches ? (
            <Button variant="secondary" className="self-start" onClick={() => setShowMatches(true)}>
              {t.seller.findMatches}
            </Button>
          ) : suggestionsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : !suggestions || suggestions.length === 0 ? (
            <p className="text-sm text-muted">{t.seller.noMatches}</p>
          ) : (
            <ul className="divide-y divide-border rounded border border-border bg-surface">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="truncate text-sm text-fg" dir="auto">
                      {suggestion.title}
                    </p>
                    <p className="text-xs text-muted">{tf(t.seller.similar, { pct: suggestion.confidence })}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Check className="h-4 w-4" aria-hidden />}
                    onClick={() => upsert({ id: product.id, sku: product.sku, name: product.name, canonicalProductId: suggestion.id })}
                  >
                    {t.seller.map}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-fg">{t.seller.marketPosition}</h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <p className="text-sm text-muted" dir="auto">
              {product.position.explanation}
            </p>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label={t.seller.yourPrice} value={fmt.currency(product.position.ourPrice, currency)} emphasis />
              <Metric label={t.seller.cheapest} value={fmt.currency(product.position.lowest, currency)} />
              <Metric label={t.seller.median} value={fmt.currency(product.position.marketMedian, currency)} />
              <Metric label={t.seller.highest} value={fmt.currency(product.position.highest, currency)} />
            </dl>
          </CardBody>
          {product.competitors.length > 0 && (
            <Table className="border-t border-border">
              <THead>
                <tr>
                  <Th>{t.seller.store}</Th>
                  <Th align="end">{t.seller.price}</Th>
                  <Th align="end">{t.seller.stock}</Th>
                  <Th>
                    <span className="sr-only">{t.seller.listing}</span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                {product.competitors.map((competitor) => {
                  const href = safeExternalHref(competitor.url);
                  return (
                    <tr key={competitor.platformId}>
                      <Td>{competitor.platformName}</Td>
                      <Td align="end">{fmt.currency(competitor.price, currency)}</Td>
                      <Td align="end" className="text-xs">
                        {competitor.inStock === null ? (
                          <span className="text-muted">{t.product.stockUnknown}</span>
                        ) : competitor.inStock ? (
                          <span className="text-success">{t.product.inStock}</span>
                        ) : (
                          <span className="text-danger">{t.product.outOfStock}</span>
                        )}
                      </Td>
                      <Td align="end">
                        {href && (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex text-muted hover:text-fg"
                            aria-label={tf(t.seller.openListing, { store: competitor.platformName })}
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden />
                          </a>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-fg">{t.seller.yourNumbers}</h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {numberField(tf(t.seller.unitCost, { currency }), 'cost')}
            {numberField(tf(t.seller.yourPriceIn, { currency }), 'price')}
            {numberField(t.seller.targetMargin, 'target')}
            {numberField(t.seller.minMargin, 'min')}
            <Button className="w-full" loading={saving} onClick={save}>
              {t.seller.save}
            </Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-wrap">
          <h2 className="text-sm font-semibold text-fg">{t.seller.recommendation}</h2>
          {rec.confidence !== 'NONE' && (
            <Badge variant={CONFIDENCE[rec.confidence] ?? 'outline'}>{t.intel.confidence[rec.confidence] ?? rec.confidence}</Badge>
          )}
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {rec.recommendedPrice == null ? (
            <p className="text-sm text-muted" dir="auto">
              {rec.rationale[0] ?? t.seller.notEnoughInfo}
            </p>
          ) : (
            <>
              <dl className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <div className="flex flex-col gap-1">
                  <dt className="label-mono text-muted">{t.seller.recommended}</dt>
                  <dd className="text-2xl font-semibold tabular-nums text-brand">{fmt.currency(rec.recommendedPrice, currency)}</dd>
                </div>
                <Metric label={t.seller.floor} value={fmt.currency(rec.floorPrice, currency)} />
                <Metric label={t.seller.targetPrice} value={fmt.currency(rec.targetPrice, currency)} />
                <Metric label={t.seller.resultingMargin} value={formatSignedPercent(rec.projectedMarginPct).replace('+', '')} />
                <Metric label={t.seller.currentMargin} value={formatSignedPercent(rec.currentMarginPct).replace('+', '')} />
              </dl>
              <ul className="flex list-disc flex-col gap-1 ps-4 text-sm text-muted marker:text-border-strong" dir="auto">
                {rec.rationale.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </>
          )}
          {/* Always shown, never collapsed: a pricing suggestion presented as
              certainty is how a seller loses money and blames the tool. */}
          <p className="flex items-start gap-2 rounded-sm bg-surface-2 p-3 text-xs text-muted" dir="auto">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            {rec.caveat}
          </p>
        </CardBody>
      </Card>

      <SellerTools orgId={orgId} productId={product.id} currency={currency} hasCost={product.cost != null} />
    </div>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label-mono text-muted">{label}</dt>
      <dd className={cn('text-sm font-semibold tabular-nums', emphasis ? 'text-fg' : 'text-muted')}>{value}</dd>
    </div>
  );
}
