'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useEntitlements } from '@/lib/hooks/use-billing';
import { useCreateWorkspace, useWorkspaces } from '@/lib/hooks/use-seller';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { FEATURES } from '@/types/billing.types';
import { SignedInGate } from '../account/signed-in-gate';

export default function SellerHomePage() {
  const { t } = useI18n();
  return (
    <SignedInGate path="/seller" prompt={t.seller.signInPrompt}>
      <Workspaces />
    </SignedInGate>
  );
}

function Workspaces() {
  const { t, tp } = useI18n();
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements();
  const { data: workspaces, isLoading } = useWorkspaces();
  const { mutate: create, isPending } = useCreateWorkspace();
  const [name, setName] = useState('');
  const canCreateSeller = hasFeature(FEATURES.SELLER_WORKSPACE);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-fg">{t.seller.workspaces}</h1>
        <p className="text-sm text-muted">{t.seller.workspacesLede}</p>
      </header>

      {isLoading || entitlementsLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : workspaces && workspaces.length > 0 ? (
        <ul className="divide-y divide-border rounded border border-border bg-surface">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Link
                href={`/seller/${workspace.id}`}
                className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-2 sm:px-6"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-fg" dir="auto">
                    {workspace.name}
                  </p>
                  <p className="text-xs text-muted">
                    {[tp(t.seller.products, workspace.productCount), tp(t.seller.members, workspace.memberCount)].join(' · ')}
                    {workspace.platform ? ` · ${workspace.platform.name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t.seller.orgTypes[workspace.type] ?? workspace.type}</Badge>
                  <Badge>{t.seller.roles[workspace.role] ?? workspace.role}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : !canCreateSeller ? (
        <UpgradePrompt title={t.seller.planTitle} description={t.seller.planBody} />
      ) : (
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-fg">{t.seller.createTitle}</h2>
              <p className="text-sm text-muted">{t.seller.createBody}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                label={t.seller.workspaceName}
                dir="auto"
                wrapperClassName="flex-1"
              />
              <Button
                leftIcon={<Plus className="h-4 w-4" aria-hidden />}
                loading={isPending}
                disabled={name.trim().length < 2}
                onClick={() => create({ name: name.trim(), type: 'SELLER' })}
              >
                {t.seller.create}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
