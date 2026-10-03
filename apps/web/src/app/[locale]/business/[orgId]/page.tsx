'use client';

import { useParams } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import { BusinessTools } from '@/components/business/business-tools';
import { useI18n } from '@/lib/i18n/provider';
import { SignedInGate } from '../../account/signed-in-gate';

export default function BusinessWorkspacePage() {
  const { t } = useI18n();
  const { orgId } = useParams<{ orgId: string }>();
  return (
    <SignedInGate path={`/business/${orgId}`} prompt={t.business.signIn}>
      <div className="mx-auto flex max-w-page flex-col gap-6 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
            <Briefcase className="h-5 w-5 text-brand-text" aria-hidden />
            {t.business.title}
          </h1>
          <p className="text-sm text-muted">{t.business.lede}</p>
        </header>
        <BusinessTools orgId={orgId} />
      </div>
    </SignedInGate>
  );
}
