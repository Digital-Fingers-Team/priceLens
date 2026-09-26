'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, Bell, Package, Plus, Search, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PositionBadge } from '@/components/seller/position-badge';
import {
  useSellerProducts,
  useUpsertSellerProduct,
  useWorkspaceSummary,
} from '@/lib/hooks/use-seller';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export default function WorkspaceDashboard() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: summary, isLoading: summaryLoading } = useWorkspaceSummary(orgId);
  const { data: products, isLoading: productsLoading } = useSellerProducts(orgId, debouncedSearch || undefined);
  const { mutate: upsert, isPending: saving } = useUpsertSellerProduct(orgId);

  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-50">Market overview</h1>
          <p className="mt-1 text-sm text-ink-400">
            Where you stand against every store we track.
          </p>
        </div>
        <Link href={`/seller/${orgId}/events`} className={buttonClassName({ variant: 'ghost' })}>
          <Bell className="h-4 w-4" />
          Competitor activity
          {summary && summary.unacknowledgedEvents > 0 && (
            <span className="ml-2 rounded-full bg-signal px-1.5 text-[0.65rem] font-bold text-ink-950">
              {summary.unacknowledgedEvents}
            </span>
          )}
        </Link>
      </header>

      {summaryLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Products monitored" value={summary.products.total} icon={Package} />
            <StatTile
              label="Mapped to catalogue"
              value={summary.products.mapped}
              icon={Package}
              // Unmapped products are invisible to monitoring, so this is
              // surfaced as a warning rather than buried in a settings page.
              tone={summary.products.unmapped > 0 ? 'warning' : 'default'}
              hint={summary.products.unmapped > 0 ? `${summary.products.unmapped} not mapped yet` : undefined}
            />
            <StatTile
              label="Unread events"
              value={summary.unacknowledgedEvents}
              icon={Bell}
              tone={summary.unacknowledgedEvents > 0 ? 'warning' : 'default'}
            />
            <StatTile
              label="Price drops (7d)"
              value={summary.last7Days.PRICE_DROP ?? 0}
              icon={TrendingDown}
            />
          </div>

          {summary.biggestDrops.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-ink-100">Biggest competitor drops this week</h2>
              </CardHeader>
              <CardBody className="overflow-x-auto p-0">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-800 text-left text-xs text-ink-500">
                      <th className="px-5 py-2 font-medium">Product</th>
                      <th className="px-5 py-2 font-medium">Store</th>
                      <th className="px-5 py-2 text-right font-medium">Was</th>
                      <th className="px-5 py-2 text-right font-medium">Now</th>
                      <th className="px-5 py-2 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.biggestDrops.map((drop) => (
                      <tr key={drop.id} className="border-b border-ink-800/60 last:border-0">
                        <td className="px-5 py-2.5 text-ink-200">{drop.product ?? '—'}</td>
                        <td className="px-5 py-2.5 text-ink-400">{drop.platform}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-ink-400">
                          {formatCurrency(drop.previousPrice)}
                        </td>
                        <td className="px-5 py-2.5 text-right font-medium tabular-nums text-ink-100">
                          {formatCurrency(drop.newPrice)}
                        </td>
                        <td className="px-5 py-2.5 text-right font-medium tabular-nums text-emerald-400">
                          {drop.changePct != null ? `${drop.changePct.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}
        </>
      ) : null}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink-100">Your products</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" aria-hidden />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search SKU or name"
              aria-label="Search products"
              className="w-56 pl-8"
            />
          </div>
        </CardHeader>

        <CardBody className="p-0">
          {productsLoading ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-10 w-full" />
              ))}
            </div>
          ) : !products || products.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Package className="mx-auto h-6 w-6 text-ink-600" aria-hidden />
              <p className="mt-2 text-sm text-ink-300">No products yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
                Add a SKU below, then map it to our catalogue to start seeing competitor prices.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-left text-xs text-ink-500">
                    <th className="px-5 py-2 font-medium">SKU</th>
                    <th className="px-5 py-2 font-medium">Product</th>
                    <th className="px-5 py-2 text-right font-medium">Your price</th>
                    <th className="px-5 py-2 text-right font-medium">Market median</th>
                    <th className="px-5 py-2 text-right font-medium">vs median</th>
                    <th className="px-5 py-2 font-medium">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b border-ink-800/60 last:border-0 hover:bg-ink-800/30">
                      <td className="px-5 py-2.5">
                        <Link
                          href={`/seller/${orgId}/products/${product.id}`}
                          className="font-mono text-xs text-signal hover:underline"
                        >
                          {product.sku}
                        </Link>
                      </td>
                      <td className="max-w-[240px] truncate px-5 py-2.5 text-ink-200">
                        {product.name}
                        {!product.canonicalProductId && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-400">
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            not mapped
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-ink-100">
                        {formatCurrency(product.currentPrice, product.currency)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-ink-400">
                        {formatCurrency(product.position.marketMedian, product.currency)}
                      </td>
                      <td
                        className={cn(
                          'px-5 py-2.5 text-right font-medium tabular-nums',
                          product.position.vsMedianPct == null
                            ? 'text-ink-600'
                            : product.position.vsMedianPct > 0
                              ? 'text-amber-400'
                              : 'text-emerald-400',
                        )}
                      >
                        {product.position.vsMedianPct != null
                          ? `${product.position.vsMedianPct > 0 ? '+' : ''}${product.position.vsMedianPct.toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="px-5 py-2.5">
                        <PositionBadge label={product.position.label} />
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
          <h2 className="text-sm font-semibold text-ink-100">Add a product</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={newSku}
            onChange={(event) => setNewSku(event.target.value)}
            placeholder="SKU"
            aria-label="SKU"
            className="sm:w-40"
          />
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Product name as you list it"
            aria-label="Product name"
            className="flex-1"
          />
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            loading={saving}
            disabled={!newSku.trim() || !newName.trim()}
            onClick={() =>
              upsert(
                { sku: newSku.trim(), name: newName.trim() },
                {
                  onSuccess: () => {
                    setNewSku('');
                    setNewName('');
                  },
                },
              )
            }
          >
            Add
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone = 'default',
  hint,
}: {
  label: string;
  value: number;
  icon: typeof Package;
  tone?: 'default' | 'warning';
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-500">{label}</span>
        <Icon className={cn('h-4 w-4', tone === 'warning' ? 'text-amber-400' : 'text-ink-600')} aria-hidden />
      </div>
      <p className={cn('mt-2 text-2xl font-bold tabular-nums', tone === 'warning' ? 'text-amber-400' : 'text-ink-50')}>
        {value.toLocaleString()}
      </p>
      {hint && <p className="mt-0.5 text-xs text-amber-400/80">{hint}</p>}
    </div>
  );
}
