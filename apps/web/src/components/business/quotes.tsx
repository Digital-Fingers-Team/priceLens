'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { Table, TBody, Td, Th, THead } from '@/components/ui/table';
import { businessApi } from '@/lib/api/business.api';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore } from '@/lib/store/ui.store';
import { FEATURES } from '@/types/billing.types';
import type { Quote } from '@/types/business.types';
import { DownloadButton, Gate } from './shared';

/** "name, quantity, budget" per line. */
export function parseQuoteLines(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [query, quantity, budget] = line.split(',').map((part) => part.trim());
      const qty = Number(quantity);
      const max = Number(budget);
      return {
        query,
        ...(Number.isInteger(qty) && qty > 0 ? { quantity: qty } : {}),
        ...(budget && Number.isFinite(max) && max >= 0 ? { maxUnitPrice: max } : {}),
      };
    })
    .filter((item) => item.query.length >= 2);
}

export function QuotesSection({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Gate feature={FEATURES.PROCUREMENT_QUOTES} title={t.business.quotes.title}>
      {openId ? <QuoteView orgId={orgId} quoteId={openId} onBack={() => setOpenId(null)} /> : <QuoteList orgId={orgId} onOpen={setOpenId} />}
    </Gate>
  );
}

function QuoteList({ orgId, onOpen }: { orgId: string; onOpen: (id: string) => void }) {
  const { t, tp, fmt } = useI18n();
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const items = parseQuoteLines(text);
  const list = useQuery({ queryKey: ['business', orgId, 'quotes'], queryFn: () => businessApi.quotes(orgId) });
  const create = useMutation({
    mutationFn: () => businessApi.createQuote(orgId, { title: title.trim(), items }),
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: ['business', orgId, 'quotes'] });
      setTitle('');
      setText('');
      onOpen(quote.id);
    },
    onError: () => addToast(t.toast.saveFailed, 'error'),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-fg">{t.business.quotes.title}</h2>
          <p className="text-sm text-muted">{t.business.quotes.lede}</p>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <Input label={t.business.quotes.quoteTitle} value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" />
          <label className="flex flex-col gap-1 text-sm font-medium text-fg">
            {t.business.quotes.itemsLabel}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              dir="auto"
              className="w-full rounded border border-border-strong bg-surface p-3 text-sm font-normal text-fg placeholder:text-muted focus-visible:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand/40"
            />
            <span className="text-xs font-normal text-muted">{t.business.quotes.itemsHint}</span>
          </label>
          <div>
            <Button loading={create.isPending} disabled={title.trim().length < 2 || items.length === 0} onClick={() => create.mutate()}>
              {t.business.quotes.price}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-fg">{t.business.quotes.saved}</h2>
        </CardHeader>
        {list.isLoading ? (
          <CardBody>
            <Skeleton className="h-20 w-full" />
          </CardBody>
        ) : !list.data || list.data.length === 0 ? (
          <EmptyState title={t.business.quotes.empty} />
        ) : (
          <ul className="divide-y divide-border">
            {list.data.map((quote) => (
              <li key={quote.id}>
                <button type="button" onClick={() => onOpen(quote.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-start hover:bg-surface-2 sm:px-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-fg" dir="auto">
                      {quote.title}
                    </span>
                    <span className="text-xs text-muted">
                      {tp(t.business.quotes.items, quote.itemCount)} · {fmt.date(quote.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {quote.total != null && <span className="text-sm font-medium tabular-nums">{fmt.currency(quote.total, quote.currency)}</span>}
                    <Badge variant={quote.status === 'FINAL' ? 'success' : 'outline'}>{quote.status === 'FINAL' ? t.business.quotes.final : t.business.quotes.draft}</Badge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function QuoteView({ orgId, quoteId, onBack }: { orgId: string; quoteId: string; onBack: () => void }) {
  const { t, tf, fmt } = useI18n();
  const queryClient = useQueryClient();
  const key = ['business', orgId, 'quote', quoteId];
  const { data: quote, isLoading } = useQuery({ queryKey: key, queryFn: () => businessApi.quote(orgId, quoteId) });
  const setQuote = (next: Quote) => {
    queryClient.setQueryData(key, next);
    queryClient.invalidateQueries({ queryKey: ['business', orgId, 'quotes'] });
  };
  const reprice = useMutation({ mutationFn: () => businessApi.repriceQuote(orgId, quoteId), onSuccess: setQuote });
  const finalize = useMutation({ mutationFn: () => businessApi.finalizeQuote(orgId, quoteId), onSuccess: setQuote });
  const remove = useMutation({
    mutationFn: () => businessApi.deleteQuote(orgId, quoteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business', orgId, 'quotes'] });
      onBack();
    },
  });
  const qty = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) => businessApi.updateQuoteItem(orgId, quoteId, itemId, { quantity }),
    onSuccess: setQuote,
  });

  if (isLoading || !quote) return <Skeleton className="h-64 w-full" />;
  const editable = quote.status === 'DRAFT';

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
        ← {t.business.quotes.back}
      </Button>
      <Card>
        <CardHeader className="flex-wrap">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-fg" dir="auto">
              {quote.title}
            </h2>
            <p className="text-xs text-muted">{quote.pricedAt ? tf(t.business.quotes.pricedAt, { date: fmt.date(quote.pricedAt) }) : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadButton path={businessApi.quoteFilePath(orgId, quote.id, 'pdf')} filename="quotation.pdf" label={t.business.pdf} />
            <DownloadButton path={businessApi.quoteFilePath(orgId, quote.id, 'csv')} filename="quotation.csv" label={t.business.csv} />
            {editable && (
              <>
                <Button size="sm" variant="secondary" loading={reprice.isPending} onClick={() => reprice.mutate()}>
                  {t.business.quotes.reprice}
                </Button>
                <Button size="sm" loading={finalize.isPending} onClick={() => finalize.mutate()}>
                  {t.business.quotes.finalize}
                </Button>
              </>
            )}
            <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t.business.quotes.remove}
            </Button>
          </div>
        </CardHeader>
        <Table wide>
          <THead>
            <tr>
              <Th>{t.business.quotes.request}</Th>
              <Th>{t.business.quotes.matched}</Th>
              <Th>{t.business.quotes.store}</Th>
              <Th align="end">{t.business.quotes.qty}</Th>
              <Th align="end">{t.business.quotes.unit}</Th>
              <Th align="end">{t.business.quotes.line}</Th>
              <Th>{t.business.quotes.stock}</Th>
            </tr>
          </THead>
          <TBody>
            {quote.items.map((item) => (
              <tr key={item.id} className="align-top">
                <Td dir="auto">{item.query}</Td>
                <Td dir="auto" className={item.matchedTitle ? '' : 'text-warning'}>
                  {item.matchedTitle ?? t.business.quotes.noMatch}
                </Td>
                <Td>
                  {item.store ? (
                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1">
                        {item.store}
                        {item.listingUrl && (
                          <a href={item.listingUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand">
                            <ExternalLink className="h-4 w-4" aria-hidden />
                          </a>
                        )}
                      </span>
                      {item.storeKind === 'OFFLINE_CHAIN' && <span className="text-xs text-muted">{t.business.quotes.chain}</span>}
                      {item.alternatives.length > 0 && (
                        <span className="text-xs text-muted">
                          {t.business.quotes.others}: {item.alternatives.map((alt) => `${alt.store} ${fmt.currency(alt.unitPrice, quote.currency)}`).join(' · ')}
                        </span>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td align="end">
                  {editable ? (
                    <Input
                      size="sm"
                      type="number"
                      min={1}
                      defaultValue={item.quantity}
                      aria-label={t.business.quotes.qty}
                      wrapperClassName="w-20"
                      dir="ltr"
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isInteger(next) && next > 0 && next !== item.quantity) qty.mutate({ itemId: item.id, quantity: next });
                      }}
                    />
                  ) : (
                    item.quantity
                  )}
                </Td>
                <Td align="end">
                  {item.unitPrice != null ? fmt.currency(item.unitPrice, quote.currency) : '—'}
                  {item.overBudget && <Badge variant="warning" className="ms-2">{t.business.quotes.overBudget}</Badge>}
                </Td>
                <Td align="end" className="font-medium">
                  {item.lineTotal != null ? fmt.currency(item.lineTotal, quote.currency) : '—'}
                </Td>
                <Td className="text-muted">{item.inStock == null ? t.business.quotes.unknownStock : item.inStock ? t.business.quotes.inStock : t.business.quotes.outOfStock}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
        <CardBody className="flex flex-col gap-2">
          <p className="text-base font-semibold text-fg">
            {t.business.quotes.total}: {quote.total != null ? fmt.currency(quote.total, quote.currency) : '—'}
          </p>
          {quote.unpricedCount > 0 && <p className="text-sm text-warning">{tf(t.business.quotes.notPriced, { count: quote.unpricedCount })}</p>}
          <p className="text-xs text-muted">{t.business.quotes.deliveryNote}</p>
        </CardBody>
      </Card>
    </div>
  );
}
