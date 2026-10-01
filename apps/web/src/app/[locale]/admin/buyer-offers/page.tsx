import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { BuyerOffersAdmin } from '@/components/admin/buyer-offers-admin';

export const metadata: Metadata = { title: 'Offers & installments — Admin', robots: NOINDEX };

export default function AdminBuyerOffersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Offers, installments & warranty</h1>
        <p className="text-sm text-muted mt-1">
          What buyers see around the price on every product page. Type in the providers&apos; and banks&apos; published terms;
          nothing here is filled in automatically. Coupons show only while verified in the last 30 days or reported working
          by a buyer in the last 14.
        </p>
      </div>
      <BuyerOffersAdmin />
    </div>
  );
}
