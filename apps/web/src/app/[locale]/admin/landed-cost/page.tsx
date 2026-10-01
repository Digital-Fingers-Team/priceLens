import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { LandedCostRules } from '@/components/admin/landed-cost-rules';

export const metadata: Metadata = { title: 'Landed cost — Admin', robots: NOINDEX };

export default function AdminLandedCostPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Landed cost</h1>
        <p className="text-sm text-muted mt-1">
          How an imported offer is priced at the door in Egypt: customs and VAT on the goods plus shipping, then fees. A
          store with a rule counts as cross-border. A category rule beats the store default. The seeded rates are
          placeholders: set real ones before relying on them.
        </p>
      </div>
      <LandedCostRules />
    </div>
  );
}
