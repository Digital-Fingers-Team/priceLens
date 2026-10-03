'use client';

import { useState } from 'react';
import { Tabs } from '@/components/ui/tabs';
import { useI18n } from '@/lib/i18n/provider';
import { MapSection, SellersSection } from './map-and-sellers';
import { QuotesSection } from './quotes';
import { ApiSection, ReportsSection } from './reports-and-api';

type Section = 'map' | 'sellers' | 'reports' | 'quotes' | 'api';

/** The business workspace: MAP, authorized sellers, reports, quotes, API keys. */
export function BusinessTools({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('map');
  return (
    <div className="flex flex-col gap-6">
      <Tabs
        label={t.business.sections}
        controls="business-panel"
        value={section}
        onValueChange={setSection}
        items={[
          { value: 'map', label: t.business.map.tab },
          { value: 'sellers', label: t.business.sellers.tab },
          { value: 'reports', label: t.business.reports.tab },
          { value: 'quotes', label: t.business.quotes.tab },
          { value: 'api', label: t.business.api.tab },
        ]}
      />
      <div id="business-panel" role="tabpanel" className="flex flex-col gap-6">
        {section === 'map' && <MapSection orgId={orgId} />}
        {section === 'sellers' && <SellersSection orgId={orgId} />}
        {section === 'reports' && <ReportsSection orgId={orgId} />}
        {section === 'quotes' && <QuotesSection orgId={orgId} />}
        {section === 'api' && <ApiSection orgId={orgId} />}
      </div>
    </div>
  );
}
