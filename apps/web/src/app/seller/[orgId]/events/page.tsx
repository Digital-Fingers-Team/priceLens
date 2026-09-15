'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  PackageX,
  PackageCheck,
  Store,
  TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAcknowledgeEvent,
  useAlertRules,
  useCompetitorEvents,
  useUpsertAlertRule,
} from '@/lib/hooks/use-seller';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { CompetitorEvent, CompetitorEventType } from '@/types/seller.types';

const EVENT_META: Record<
  CompetitorEventType,
  { label: string; icon: typeof TrendingDown; tone: string }
> = {
  PRICE_DROP: { label: 'Price drop', icon: ArrowDownRight, tone: 'text-emerald-400' },
  PRICE_INCREASE: { label: 'Price increase', icon: ArrowUpRight, tone: 'text-amber-400' },
  UNDERCUT: { label: 'Undercut', icon: TrendingDown, tone: 'text-red-400' },
  OUT_OF_STOCK: { label: 'Out of stock', icon: PackageX, tone: 'text-ink-400' },
  BACK_IN_STOCK: { label: 'Back in stock', icon: PackageCheck, tone: 'text-blue-400' },
  NEW_ENTRANT: { label: 'New seller', icon: Store, tone: 'text-blue-400' },
  UNUSUAL_MOVEMENT: { label: 'Unusual movement', icon: CircleAlert, tone: 'text-amber-400' },
  MAP_VIOLATION: { label: 'MAP violation', icon: CircleAlert, tone: 'text-red-400' },
};

/** Rules a seller can subscribe to, in the order they matter commercially. */
const RULE_TYPES: CompetitorEventType[] = [
  'UNDERCUT',
  'PRICE_DROP',
  'PRICE_INCREASE',
  'OUT_OF_STOCK',
  'BACK_IN_STOCK',
  'NEW_ENTRANT',
  'UNUSUAL_MOVEMENT',
];

export default function CompetitorEventsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading } = useCompetitorEvents(orgId, unreadOnly);
  const { data: rules } = useAlertRules(orgId);
  const { mutate: acknowledge } = useAcknowledgeEvent(orgId);
  const { mutate: upsertRule } = useUpsertAlertRule(orgId);

  const ruleFor = (type: CompetitorEventType) => rules?.find((rule) => rule.type === type);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <Link
        href={`/seller/${orgId}`}
        className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to workspace
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-50">Competitor activity</h1>
          <p className="mt-1 text-sm text-ink-400">
            Every change we detected, with the listing it came from.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-400">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
            className="h-4 w-4 rounded border-ink-600 bg-ink-800"
          />
          Unacknowledged only
        </label>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-700 bg-ink-900/50 px-6 py-12 text-center">
              <Store className="mx-auto h-6 w-6 text-ink-600" aria-hidden />
              <h2 className="mt-3 text-sm font-medium text-ink-300">
                {unreadOnly ? 'Nothing unacknowledged' : 'No competitor activity yet'}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-500">
                {unreadOnly
                  ? 'You are up to date.'
                  : 'We check for competitor changes after every price refresh. Map your products to the catalogue to start seeing them.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.items.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onAcknowledge={() => acknowledge(event.id)}
                />
              ))}
            </ul>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <h2 className="text-sm font-semibold text-ink-100">Tell me about</h2>
            <p className="mt-1 text-xs text-ink-500">
              Changes are always recorded. These decide what is worth a notification.
            </p>
          </CardHeader>
          <CardBody className="space-y-2.5">
            {RULE_TYPES.map((type) => {
              const rule = ruleFor(type);
              const meta = EVENT_META[type];
              return (
                <label key={type} className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={rule?.isActive ?? false}
                    onChange={(event) =>
                      upsertRule({ type, isActive: event.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-ink-600 bg-ink-800"
                  />
                  <span className="min-w-0">
                    <span className={cn('text-sm', rule?.isActive ? 'text-ink-200' : 'text-ink-400')}>
                      {meta.label}
                    </span>
                    {rule?.isActive && (
                      <span className="block text-xs text-ink-600">
                        at {rule.thresholdPct}% or more, at most once every {rule.cooldownHours}h
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function EventRow({ event, onAcknowledge }: { event: CompetitorEvent; onAcknowledge: () => void }) {
  const meta = EVENT_META[event.type];
  const Icon = meta.icon;
  const unread = !event.acknowledgedAt;
  const evidenceUrl = typeof event.evidence?.url === 'string' ? event.evidence.url : null;

  return (
    <li
      className={cn(
        'rounded-xl border p-4',
        unread ? 'border-ink-600 bg-ink-900' : 'border-ink-800 bg-ink-900/40',
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.tone)} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-100">{meta.label}</span>
            <Badge variant="outline">{event.platform.name}</Badge>
            {event.severity === 'CRITICAL' && <Badge variant="danger">critical</Badge>}
            {event.severity === 'WARNING' && <Badge variant="warning">warning</Badge>}
          </div>

          <p className="mt-1 text-sm text-ink-300">
            {event.sellerProduct?.name ?? event.canonicalProduct?.title ?? 'Unknown product'}
          </p>

          {event.previousPrice != null && event.newPrice != null && (
            <p className="mt-1.5 text-sm tabular-nums text-ink-400">
              {formatCurrency(event.previousPrice)}{' '}
              <span aria-hidden>→</span>{' '}
              <span className="font-semibold text-ink-100">{formatCurrency(event.newPrice)}</span>
              {event.changePct != null && (
                <span className={cn('ml-2', event.changePct < 0 ? 'text-emerald-400' : 'text-amber-400')}>
                  {event.changePct > 0 ? '+' : ''}
                  {event.changePct.toFixed(1)}%
                </span>
              )}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-600">
            <time dateTime={event.detectedAt}>{new Date(event.detectedAt).toLocaleString()}</time>
            {/* The listing the claim came from — evidence, not assertion. */}
            {evidenceUrl && (
              <a
                href={evidenceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-ink-500 underline hover:text-ink-300"
              >
                View the listing
              </a>
            )}
          </div>
        </div>

        {unread && (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Check className="h-3.5 w-3.5" />}
            onClick={onAcknowledge}
          >
            Got it
          </Button>
        )}
      </div>
    </li>
  );
}
