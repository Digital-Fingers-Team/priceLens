'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { useCreateWorkspace, useWorkspaces } from '@/lib/hooks/use-seller';
import { useEntitlements } from '@/lib/hooks/use-billing';
import { useAuthStore } from '@/lib/store/auth.store';
import { FEATURES } from '@/types/billing.types';

export default function SellerHomePage() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements();
  const { data: workspaces, isLoading } = useWorkspaces();
  const { mutate: create, isPending } = useCreateWorkspace();

  const [name, setName] = useState('');
  const canCreateSeller = hasFeature(FEATURES.SELLER_WORKSPACE);

  // Until the stored session is read, "signed out" is not known yet.
  if (!hasHydrated) {
    return <div className="mx-auto max-w-2xl px-4 py-12" aria-busy="true" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-sm text-ink-400">
          <Link href="/login" className="text-signal hover:underline">
            Sign in
          </Link>{' '}
          to open your seller workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-50">Workspaces</h1>
        <p className="mt-1 text-sm text-ink-400">
          Monitor what your competitors charge, and price with your margin in view.
        </p>
      </header>

      {isLoading || entitlementsLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : workspaces && workspaces.length > 0 ? (
        <ul className="space-y-3">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Link href={`/seller/${workspace.id}`}>
                <Card hover>
                  <CardBody className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-ink-500" aria-hidden />
                      <div>
                        <p className="font-semibold text-ink-50">{workspace.name}</p>
                        <p className="text-xs text-ink-500">
                          {workspace.productCount} product(s) · {workspace.memberCount} member(s)
                          {workspace.platform ? ` · sells on ${workspace.platform.name}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{workspace.type.toLowerCase()}</Badge>
                      <Badge variant="default">{workspace.role.toLowerCase()}</Badge>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : !canCreateSeller ? (
        <UpgradePrompt
          title="Seller workspaces are part of the Seller plan"
          description="Map your catalogue to ours, watch every competitor's price and stock, and get a pricing recommendation that respects your cost and margin."
        />
      ) : (
        <Card>
          <CardBody className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-100">Create your workspace</h2>
              <p className="mt-1 text-xs text-ink-500">
                Name it after your shop. You can add products and teammates afterwards.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My Electronics Store"
                aria-label="Workspace name"
                className="flex-1"
              />
              <Button
                leftIcon={<Plus className="h-4 w-4" />}
                loading={isPending}
                disabled={name.trim().length < 2}
                onClick={() => create({ name: name.trim(), type: 'SELLER' })}
              >
                Create
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
