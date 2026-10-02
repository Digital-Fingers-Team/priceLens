'use client';

import { Ship } from 'lucide-react';
import { ImporterTools } from '@/components/trade/importer-tools';
import { useI18n } from '@/lib/i18n/provider';
import { SignedInGate } from '../account/signed-in-gate';

/** Importers & traders: what to bring in, what the dollar does to it, what is moving. */
export default function ImportersPage() {
  const { t } = useI18n();
  return (
    <SignedInGate path="/importers" prompt={t.trade.signIn}>
      <div className="mx-auto flex max-w-page flex-col gap-6 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
            <Ship className="h-5 w-5 text-brand" aria-hidden />
            {t.trade.title}
          </h1>
          <p className="text-sm text-muted">{t.trade.lede}</p>
        </header>
        <ImporterTools />
      </div>
    </SignedInGate>
  );
}
