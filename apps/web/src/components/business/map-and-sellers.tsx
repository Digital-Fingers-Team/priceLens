'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, Td, Th, THead } from '@/components/ui/table';
import { businessApi } from '@/lib/api/business.api';
import { useSellerProducts, useUpsertSellerProduct } from '@/lib/hooks/use-seller';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore } from '@/lib/store/ui.store';
import { FEATURES } from '@/types/billing.types';
import type { SellerProductRow } from '@/types/seller.types';
import { DownloadButton, Gate } from './shared';

// ── MAP ──────────────────────────────────────────────────────────────────

export function MapSection({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  return (
    <Gate feature={FEATURES.MAP_MONITORING} title={t.business.map.title}>
      <div className="flex flex-col gap-6">
        <MapPrices orgId={orgId} />
        <Violations orgId={orgId} />
      </div>
    </Gate>
  );
}

function MapPrices({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const { data: products, isLoading } = useSellerProducts(orgId);
  const { mutate: upsert, isPending } = useUpsertSellerProduct(orgId);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-fg">{t.business.map.title}</h2>
        <p className="text-sm text-muted">{t.business.map.lede}</p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-fg">{t.business.map.setTitle}</h3>
          <p className="text-xs text-muted">{t.business.map.setLede}</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !products || products.length === 0 ? (
          <EmptyState title={t.business.map.noProducts} description={t.business.map.noProductsBody} />
        ) : (
          <Table wide>
            <THead>
              <tr>
                <Th>{t.business.map.sku}</Th>
                <Th>{t.business.map.product}</Th>
                <Th align="end">{t.business.map.mapPrice}</Th>
              </tr>
            </THead>
            <TBody>
              {products.map((product) => (
                <MapRow key={`${product.id}:${product.mapPrice ?? ''}`} orgId={orgId} product={product} />
              ))}
            </TBody>
          </Table>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input label={t.business.map.sku} value={sku} onChange={(e) => setSku(e.target.value)} dir="ltr" wrapperClassName="sm:w-40" />
          <Input label={t.business.map.name} value={name} onChange={(e) => setName(e.target.value)} dir="auto" wrapperClassName="flex-1" />
          <Button
            loading={isPending}
            disabled={!sku.trim() || !name.trim()}
            onClick={() =>
              upsert(
                { sku: sku.trim(), name: name.trim() },
                {
                  onSuccess: () => {
                    setSku('');
                    setName('');
                  },
                },
              )
            }
          >
            {t.business.map.add}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function MapRow({ orgId, product }: { orgId: string; product: SellerProductRow }) {
  const { t } = useI18n();
  const [value, setValue] = useState(product.mapPrice != null ? String(product.mapPrice) : '');
  const { mutate, isPending } = useMutation({
    mutationFn: (mapPrice: number | null) => businessApi.setMap(orgId, { sku: product.sku, name: product.name }, mapPrice),
  });
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const parsed = value.trim() === '' ? null : Number(value);
  const valid = parsed === null || (Number.isFinite(parsed) && parsed >= 0);
  const unchanged = (product.mapPrice ?? null) === parsed;

  return (
    <tr>
      <Td className="font-mono text-xs" dir="ltr">
        {product.sku}
      </Td>
      <Td dir="auto">{product.name}</Td>
      <Td align="end">
        <div className="flex items-center justify-end gap-2">
          <Input
            size="sm"
            type="number"
            min={0}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`${t.business.map.mapPrice} ${product.sku}`}
            wrapperClassName="w-28"
            dir="ltr"
          />
          <Button
            size="sm"
            variant="secondary"
            loading={isPending}
            disabled={!valid || unchanged}
            onClick={() =>
              mutate(parsed, {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: ['seller', orgId] });
                  addToast(t.toast.saved, 'success');
                },
                onError: () => addToast(t.toast.saveFailed, 'error'),
              })
            }
          >
            {t.business.map.save}
          </Button>
        </div>
      </Td>
    </tr>
  );
}

function Violations({ orgId }: { orgId: string }) {
  const { t, fmt } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['business', orgId, 'violations'], queryFn: () => businessApi.violations(orgId) });
  const { mutate: acknowledge } = useMutation({
    mutationFn: (eventId: string) => businessApi.acknowledge(orgId, eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['business', orgId, 'violations'] }),
  });

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <h2 className="text-base font-semibold text-fg">{t.business.map.violations}</h2>
        <DownloadButton path={businessApi.violationsCsvPath(orgId)} filename="map-violations.csv" label={t.business.map.exportCsv} />
      </CardHeader>
      {isLoading ? (
        <CardBody>
          <Skeleton className="h-32 w-full" />
        </CardBody>
      ) : !data || data.length === 0 ? (
        <EmptyState title={t.business.map.empty} description={t.business.map.emptyBody} />
      ) : (
        <Table wide>
          <THead>
            <tr>
              <Th>{t.business.map.product}</Th>
              <Th>{t.business.map.retailer}</Th>
              <Th align="end">{t.business.map.mapPrice}</Th>
              <Th align="end">{t.business.map.advertised}</Th>
              <Th align="end">{t.business.map.below}</Th>
              <Th>{t.business.map.seen}</Th>
              <Th>{t.business.map.evidence}</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {data.map((violation) => (
              <tr key={violation.eventId}>
                <Td dir="auto">{violation.productName}</Td>
                <Td>{violation.retailer}</Td>
                <Td align="end">{fmt.currency(violation.mapPrice)}</Td>
                <Td align="end" className="font-medium">
                  {fmt.currency(violation.advertisedPrice)}
                </Td>
                <Td align="end" className="text-danger" dir="ltr">
                  {fmt.number(violation.differencePct)}%
                </Td>
                <Td className="text-muted">{fmt.date(violation.detectedAt)}</Td>
                <Td>
                  {violation.listingUrl && (
                    <a href={violation.listingUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline">
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      <span className="sr-only">{t.business.map.evidence}</span>
                    </a>
                  )}
                </Td>
                <Td align="end">
                  {violation.acknowledgedAt ? (
                    <Badge variant="outline">{t.business.map.acknowledged}</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => acknowledge(violation.eventId)}>
                      {t.business.map.acknowledge}
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

// ── Authorized sellers ───────────────────────────────────────────────────

export function SellersSection({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  return (
    <Gate feature={FEATURES.DISTRIBUTION_MONITORING} title={t.business.sellers.title}>
      <div className="flex flex-col gap-6">
        <AuthorizedList orgId={orgId} />
        <UnauthorizedListings orgId={orgId} />
      </div>
    </Gate>
  );
}

function AuthorizedList({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const { data, isLoading } = useQuery({ queryKey: ['business', orgId, 'authorized'], queryFn: () => businessApi.authorized(orgId) });
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const selected = picked ?? new Set((data?.retailers ?? []).filter((r) => r.authorized).map((r) => r.platformId));
  const { mutate, isPending } = useMutation({
    mutationFn: () => businessApi.setAuthorized(orgId, [...selected]),
    onSuccess: () => {
      setPicked(null);
      queryClient.invalidateQueries({ queryKey: ['business', orgId] });
      addToast(t.business.sellers.saved, 'success');
    },
    onError: () => addToast(t.toast.saveFailed, 'error'),
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-fg">{t.business.sellers.title}</h2>
        <p className="text-sm text-muted">{t.business.sellers.lede}</p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {isLoading || !data ? (
          <Skeleton className="h-32 w-full" />
        ) : data.retailers.length === 0 ? (
          <EmptyState title={t.business.map.noProducts} description={t.business.map.noProductsBody} />
        ) : (
          <>
            {!data.declared && picked === null && <p className="text-sm text-warning">{t.business.sellers.notDeclaredBody}</p>}
            <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.retailers.map((retailer) => (
                <li key={retailer.platformId}>
                  <Checkbox
                    label={retailer.name}
                    description={`${t.business.sellers.listings}: ${retailer.listings}`}
                    checked={selected.has(retailer.platformId)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(retailer.platformId);
                      else next.delete(retailer.platformId);
                      setPicked(next);
                    }}
                  />
                </li>
              ))}
            </ul>
            <div>
              <Button loading={isPending} disabled={picked === null} onClick={() => mutate()}>
                {t.business.sellers.save}
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function UnauthorizedListings({ orgId }: { orgId: string }) {
  const { t, fmt } = useI18n();
  const { data, isLoading } = useQuery({ queryKey: ['business', orgId, 'unauthorized'], queryFn: () => businessApi.unauthorized(orgId) });
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-fg">{t.business.sellers.unauthorizedTitle}</h2>
        <p className="text-sm text-muted">{t.business.sellers.unauthorizedLede}</p>
      </CardHeader>
      {isLoading || !data ? (
        <CardBody>
          <Skeleton className="h-32 w-full" />
        </CardBody>
      ) : !data.declared ? (
        <EmptyState title={t.business.sellers.notDeclared} description={t.business.sellers.notDeclaredBody} />
      ) : data.listings.length === 0 ? (
        <EmptyState title={t.business.sellers.none} />
      ) : (
        <Table wide>
          <THead>
            <tr>
              <Th>{t.business.sellers.store}</Th>
              <Th>{t.business.sellers.product}</Th>
              <Th align="end">{t.business.sellers.price}</Th>
              <Th>{t.business.map.seen}</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {data.listings.map((listing) => (
              <tr key={`${listing.retailerSlug}:${listing.listingUrl}`}>
                <Td>{listing.retailer}</Td>
                <Td dir="auto">{listing.productName}</Td>
                <Td align="end">
                  {fmt.currency(listing.price)}
                  {listing.belowMap && <Badge variant="danger" className="ms-2">{t.business.sellers.mapNote}</Badge>}
                </Td>
                <Td className="text-muted">{fmt.date(listing.lastSeenAt)}</Td>
                <Td>
                  <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline">
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{t.business.sellers.link}</span>
                  </a>
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
