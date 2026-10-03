'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { PositionBadge } from '@/components/seller/position-badge';
import { TeamPanel } from '@/components/seller/team-panel';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, Td, Th, THead } from '@/components/ui/table';
import { SellerImport } from '@/components/seller/seller-tools';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useSellerProducts, useUpsertSellerProduct, useWorkspaceSummary } from '@/lib/hooks/use-seller';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import { formatSignedPercent as signedPercent } from '@/lib/utils/format';

export default function WorkspaceDashboard() {
  const { t, tf, fmt } = useI18n();
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
    <div className="mx-auto flex max-w-page flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-fg">{t.seller.overview}</h1>
          <p className="text-sm text-muted">{t.seller.overviewLede}</p>
        </div>
        <Link href={`/seller/${orgId}/events`} className={buttonClassName({ variant: 'secondary' })}>
          {t.seller.activity}
          {summary && summary.unacknowledgedEvents > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 font-sans text-xs text-brand-fg">
              {summary.unacknowledgedEvents}
            </span>
          )}
        </Link>
      </header>

      {summaryLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-24" />
          ))}
        </div>
      ) : summary ? (
        <>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label={t.seller.monitored} value={fmt.number(summary.products.total)} />
            <StatTile
              label={t.seller.mapped}
              value={fmt.number(summary.products.mapped)}
              // Unmapped products are invisible to monitoring, so this is
              // surfaced as a warning rather than buried in a settings page.
              warning={summary.products.unmapped > 0}
              hint={summary.products.unmapped > 0 ? tf(t.seller.notMappedYet, { count: summary.products.unmapped }) : undefined}
            />
            <StatTile label={t.seller.unread} value={fmt.number(summary.unacknowledgedEvents)} warning={summary.unacknowledgedEvents > 0} />
            <StatTile label={t.seller.drops7d} value={fmt.number(summary.last7Days.PRICE_DROP ?? 0)} />
          </dl>

          {summary.biggestDrops.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-fg">{t.seller.biggestDrops}</h2>
              </CardHeader>
              <Table>
                <THead>
                  <tr>
                    <Th>{t.seller.product}</Th>
                    <Th>{t.seller.store}</Th>
                    <Th align="end">{t.seller.was}</Th>
                    <Th align="end">{t.seller.now}</Th>
                    <Th align="end">{t.seller.change}</Th>
                  </tr>
                </THead>
                <TBody>
                  {summary.biggestDrops.map((drop) => (
                    <tr key={drop.id}>
                      <Td dir="auto">{drop.product ?? '—'}</Td>
                      <Td className="text-muted">{drop.platform}</Td>
                      <Td align="end" className="text-muted">
                        {fmt.currency(drop.previousPrice)}
                      </Td>
                      <Td align="end" className="font-medium">
                        {fmt.currency(drop.newPrice)}
                      </Td>
                      <Td align="end" className="font-medium text-success" dir="ltr">
                        {signedPercent(drop.changePct)}
                      </Td>
                    </tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </>
      ) : null}

      <Card>
        <CardHeader className="flex-wrap">
          <h2 className="text-sm font-semibold text-fg">{t.seller.yourProducts}</h2>
          <Input
            size="sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.seller.searchPlaceholder}
            aria-label={t.seller.searchPlaceholder}
            leftIcon={<Search className="h-4 w-4" />}
            wrapperClassName="w-full sm:w-64"
          />
        </CardHeader>
        {productsLoading ? (
          <CardBody className="flex flex-col gap-2">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-10 w-full" />
            ))}
          </CardBody>
        ) : !products || products.length === 0 ? (
          <EmptyState title={t.seller.noProducts} description={t.seller.noProductsBody} />
        ) : (
          <Table wide>
            <THead>
              <tr>
                <Th>SKU</Th>
                <Th>{t.seller.product}</Th>
                <Th align="end">{t.seller.yourPrice}</Th>
                <Th align="end">{t.seller.marketMedian}</Th>
                <Th align="end">{t.seller.vsMedian}</Th>
                <Th>{t.seller.position}</Th>
              </tr>
            </THead>
            <TBody>
              {products.map((product) => {
                const vs = product.position.vsMedianPct;
                return (
                  <tr key={product.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/seller/${orgId}/products/${product.id}`} className="font-mono text-xs text-brand-text hover:underline" dir="ltr">
                        {product.sku}
                      </Link>
                    </Td>
                    <Td className="max-w-64">
                      <span className="line-clamp-1" dir="auto">
                        {product.name}
                      </span>
                      {!product.canonicalProductId && <span className="text-xs text-warning">{t.seller.notMapped}</span>}
                    </Td>
                    <Td align="end">{fmt.currency(product.currentPrice, product.currency)}</Td>
                    <Td align="end" className="text-muted">
                      {fmt.currency(product.position.marketMedian, product.currency)}
                    </Td>
                    <Td align="end" dir="ltr" className={cn('font-medium', vs == null ? 'text-muted' : vs > 0 ? 'text-warning' : 'text-success')}>
                      {signedPercent(vs)}
                    </Td>
                    <Td>
                      <PositionBadge label={product.position.label} />
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
          <h2 className="text-sm font-semibold text-fg">{t.seller.addProduct}</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input value={newSku} onChange={(event) => setNewSku(event.target.value)} label="SKU" dir="ltr" wrapperClassName="sm:w-40" />
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            label={t.seller.productName}
            dir="auto"
            wrapperClassName="flex-1"
          />
          <Button
            leftIcon={<Plus className="h-4 w-4" aria-hidden />}
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
            {t.seller.add}
          </Button>
        </CardBody>
      </Card>

      <SellerImport orgId={orgId} />

      <TeamPanel orgId={orgId} />
    </div>
  );
}

function StatTile({ label, value, warning, hint }: { label: string; value: string; warning?: boolean; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-surface p-4">
      <dt className="label-mono text-muted">{label}</dt>
      <dd className={cn('text-xl font-semibold tabular-nums', warning ? 'text-warning' : 'text-fg')}>{value}</dd>
      {hint && <dd className="text-xs text-warning">{hint}</dd>}
    </div>
  );
}
