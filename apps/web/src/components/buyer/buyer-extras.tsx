'use client';

import { useState } from 'react';
import { AlertTriangle, BadgeCheck, Check, Copy, CreditCard, ShieldCheck, ThumbsDown, ThumbsUp, Ticket, Wallet } from 'lucide-react';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, TBody, THead, Td, Th } from '@/components/ui/table';
import { useBuyerExtras, useReportCoupon } from '@/lib/hooks/use-buyer';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useAuthStore } from '@/lib/store/auth.store';
import type { BuyerExtras, PromoItem, Section } from '@/types/buyer.types';

/**
 * Where to buy, beyond the price: how to pay in installments, which card or
 * coupon takes something off, what warranty comes with each offer, and a
 * neutral note when an offer is priced suspiciously far below the market.
 */
export function BuyerExtrasPanel({ productId }: { productId: string }) {
  const { data } = useBuyerExtras(productId);
  if (!data) return null;

  const blocks = [
    <CautionNotes key="caution" data={data} />,
    <WarrantyBlock key="warranty" data={data} />,
    <InstallmentsBlock key="installments" data={data} />,
    <CardOffersBlock key="cards" data={data} />,
    <CouponsBlock key="coupons" data={data} />,
  ];
  return <div className="flex flex-col gap-4">{blocks}</div>;
}

/** Shared frame: hidden sections vanish; locked ones say how many and offer the upgrade. */
function SectionCard<T>({
  section,
  title,
  icon,
  lockedTitle,
  children,
}: {
  section: Section<T>;
  title: string;
  icon: React.ReactNode;
  lockedTitle: string;
  children: React.ReactNode;
}) {
  if (section.access === 'hidden' || section.count === 0) return null;
  return (
    <Card>
      <CardHeader>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          {icon}
          {title}
        </h3>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {section.access === 'locked' ? <UpgradePrompt compact title={lockedTitle} /> : children}
      </CardBody>
    </Card>
  );
}

function InstallmentsBlock({ data }: { data: BuyerExtras }) {
  const { t, tf, tp, fmt } = useI18n();
  const section = data.installments;
  return (
    <SectionCard
      section={section}
      title={t.buyer.installmentsTitle}
      icon={<Wallet className="h-4 w-4 text-brand-text" aria-hidden />}
      lockedTitle={tp(t.buyer.installmentsLocked, section.count)}
    >
      <Table>
        <THead>
          <tr>
            <Th>{t.buyer.provider}</Th>
            <Th align="end">{t.buyer.monthly}</Th>
            <Th align="end">{t.buyer.totalPaid}</Th>
            <Th align="end">{t.buyer.extraCost}</Th>
          </tr>
        </THead>
        <TBody>
          {section.items.map((plan) => (
            <tr key={plan.planId}>
              <Td>
                <span className="font-medium text-fg">{plan.provider}</span>
                <span className="block text-xs text-muted">
                  {tf(t.buyer.monthsAt, { months: plan.months, store: plan.store })}
                  {plan.downPayment > 0 ? ` · ${tf(t.buyer.downPayment, { amount: fmt.currency(plan.downPayment, data.currency) })}` : ''}
                </span>
              </Td>
              <Td align="end" className="tabular-nums">{fmt.currency(plan.monthly, data.currency)}</Td>
              <Td align="end" className="tabular-nums">{fmt.currency(plan.totalPaid, data.currency)}</Td>
              <Td align="end">
                <Badge variant={plan.extraPct <= 0 ? 'success' : plan.extraPct < 10 ? 'neutral' : 'warning'}>
                  {plan.extraPct <= 0 ? t.buyer.noExtra : `+${fmt.number(plan.extraPct)}%`}
                </Badge>
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <p className="text-xs text-muted">{t.buyer.installmentsNote}</p>
    </SectionCard>
  );
}

function PromoLine({ promo, currency }: { promo: PromoItem; currency: string }) {
  const { t, locale, fmt } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-fg" dir="auto">
          {(locale === 'ar' && promo.titleAr) || promo.title}
        </span>
        <span className="text-xs text-muted">
          {[promo.bankName, promo.store].filter(Boolean).join(' · ')}
          {promo.validUntil ? ` · ${t.buyer.until} ${fmt.date(promo.validUntil)}` : ''}
        </span>
      </div>
      {promo.saving > 0 && promo.priceAfter !== null && (
        <span className="rounded-sm bg-accent px-2 py-1 text-sm font-semibold tabular-nums text-accent-fg">
          −{fmt.currency(promo.saving, currency)} → {fmt.currency(promo.priceAfter, currency)}
        </span>
      )}
    </div>
  );
}

function CardOffersBlock({ data }: { data: BuyerExtras }) {
  const { t, tp } = useI18n();
  const signedIn = useAuthStore((s) => Boolean(s.user));
  const section = data.cardOffers;
  return (
    <SectionCard
      section={section}
      title={t.buyer.cardsTitle}
      icon={<CreditCard className="h-4 w-4 text-brand-text" aria-hidden />}
      lockedTitle={tp(t.buyer.cardsLocked, section.count)}
    >
      <ul className="flex flex-col gap-3">
        {section.items.map((promo) => (
          <li key={promo.id} className={promo.mine ? 'rounded border border-brand/40 bg-brand-soft/40 p-2' : ''}>
            {promo.mine && <Badge variant="brand" className="mb-1">{t.buyer.yourBank}</Badge>}
            <PromoLine promo={promo} currency={data.currency} />
          </li>
        ))}
      </ul>
      {signedIn && !section.banksSet && (
        <Link href="/account/banks" className="text-xs font-medium text-brand-text underline">
          {t.buyer.setBanks}
        </Link>
      )}
    </SectionCard>
  );
}

function CouponsBlock({ data }: { data: BuyerExtras }) {
  const { t, tp, tf } = useI18n();
  const report = useReportCoupon();
  const [copied, setCopied] = useState<string | null>(null);
  const section = data.coupons;

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // The code is on screen to type by hand.
    }
  };

  return (
    <SectionCard
      section={section}
      title={t.buyer.couponsTitle}
      icon={<Ticket className="h-4 w-4 text-brand-text" aria-hidden />}
      lockedTitle={tp(t.buyer.couponsLocked, section.count)}
    >
      <ul className="flex flex-col divide-y divide-border">
        {section.items.map((coupon) => (
          <li key={coupon.id} className="flex flex-col gap-2 py-3">
            <PromoLine promo={coupon} currency={data.currency} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                leftIcon={copied === coupon.code ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                onClick={() => coupon.code && copy(coupon.code)}
              >
                <span className="font-mono" dir="ltr">
                  {coupon.code}
                </span>
              </Button>
              {coupon.verified && (
                <Badge variant="success">
                  <BadgeCheck className="h-3 w-3" aria-hidden /> {t.buyer.verified}
                </Badge>
              )}
              <span className="text-xs text-muted">{tf(t.buyer.reports, { worked: coupon.workedCount, failed: coupon.failedCount })}</span>
              <Button size="sm" variant="ghost" aria-label={t.buyer.worked} onClick={() => report.mutate({ id: coupon.id, worked: true })}>
                <ThumbsUp className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="sm" variant="ghost" aria-label={t.buyer.didNotWork} onClick={() => report.mutate({ id: coupon.id, worked: false })}>
                <ThumbsDown className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function WarrantyBlock({ data }: { data: BuyerExtras }) {
  const { t, tf, fmt } = useI18n();
  const rows = data.warranty?.offers.filter((row) => row.warranty) ?? [];
  if (!data.warranty || rows.length === 0) return null;
  const weaker = data.warranty.cheapestIsWeaker;

  return (
    <Card>
      <CardHeader>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <ShieldCheck className="h-4 w-4 text-brand-text" aria-hidden />
          {t.buyer.warrantyTitle}
        </h3>
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((row) => (
            <li key={row.listingId} className="flex flex-wrap justify-between gap-2">
              <span className="text-fg">{row.store}</span>
              <span className="text-muted">
                {t.buyer.warrantyTypes[row.warranty!.type]}
                {row.warranty!.months > 0 ? ` · ${tf(t.buyer.warrantyMonths, { months: row.warranty!.months })}` : ''}
                {row.warranty!.agentName ? ` · ${row.warranty!.agentName}` : ''}
              </span>
            </li>
          ))}
        </ul>
        {weaker && (
          <p className="text-xs text-warning">
            {tf(t.buyer.weakerWarranty, { cheapest: weaker.cheapest, stronger: weaker.stronger, extra: fmt.currency(weaker.extraCost, data.currency) })}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function CautionNotes({ data }: { data: BuyerExtras }) {
  const { t, tf } = useI18n();
  if (data.caution.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {data.caution.map((row) => (
        <p key={row.listingId} className="flex items-start gap-2 rounded border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-fg">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>
            {tf(t.buyer.caution, { store: row.store })}{' '}
            {row.signals.includes('LOW_RATING')
              ? t.buyer.cautionLowRating
              : row.signals.includes('FEW_REVIEWS')
                ? t.buyer.cautionFewReviews
                : t.buyer.cautionNoData}
          </span>
        </p>
      ))}
    </div>
  );
}
