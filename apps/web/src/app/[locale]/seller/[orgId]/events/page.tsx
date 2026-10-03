'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Check, CircleAlert, PackageCheck, PackageX, Store, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { useAcknowledgeEvent, useAlertRules, useCompetitorEvents, useUpsertAlertRule } from '@/lib/hooks/use-seller';
import { intlLocale } from '@/lib/i18n/config';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils/cn';
import { formatSignedPercent } from '@/lib/utils/format';
import { safeExternalHref } from '@/lib/utils/safe-href';
import type { CompetitorEvent, CompetitorEventType } from '@/types/seller.types';

const EVENT_META: Record<CompetitorEventType, { icon: typeof TrendingDown; tone: string; savings?: boolean }> = {
  PRICE_DROP: { icon: ArrowDownRight, tone: 'bg-accent text-accent-fg', savings: true },
  PRICE_INCREASE: { icon: ArrowUpRight, tone: 'text-warning' },
  UNDERCUT: { icon: TrendingDown, tone: 'text-danger' },
  OUT_OF_STOCK: { icon: PackageX, tone: 'text-muted' },
  BACK_IN_STOCK: { icon: PackageCheck, tone: 'text-info' },
  NEW_ENTRANT: { icon: Store, tone: 'text-info' },
  UNUSUAL_MOVEMENT: { icon: CircleAlert, tone: 'text-warning' },
  MAP_VIOLATION: { icon: CircleAlert, tone: 'text-danger' },
};

/** Rules a seller can subscribe to, in the order they matter commercially. */
const RULE_TYPES: CompetitorEventType[] = ['UNDERCUT', 'PRICE_DROP', 'PRICE_INCREASE', 'OUT_OF_STOCK', 'BACK_IN_STOCK', 'NEW_ENTRANT', 'UNUSUAL_MOVEMENT'];

export default function CompetitorEventsPage() {
  const { t, tf } = useI18n();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading } = useCompetitorEvents(orgId, unreadOnly);
  const { data: rules } = useAlertRules(orgId);
  const { mutate: acknowledge } = useAcknowledgeEvent(orgId);
  const { mutate: upsertRule } = useUpsertAlertRule(orgId);

  const ruleFor = (type: CompetitorEventType) => rules?.find((rule) => rule.type === type);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href={`/seller/${orgId}`} className="inline-flex items-center gap-1 self-start text-sm text-muted hover:text-fg">
        <ArrowLeft className="flip-rtl h-4 w-4" aria-hidden />
        {t.seller.backToWorkspace}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-fg">{t.seller.activity}</h1>
          <p className="text-sm text-muted">{t.seller.activityLede}</p>
        </div>
        <Checkbox className="min-h-0 py-0" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} label={t.seller.unacknowledgedOnly} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-20 w-full" />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              icon={<Store className="h-5 w-5" />}
              title={unreadOnly ? t.seller.nothingUnacknowledged : t.seller.noActivity}
              description={unreadOnly ? t.seller.upToDate : t.seller.noActivityBody}
              className="rounded border border-dashed border-border-strong"
            />
          ) : (
            <ul className="divide-y divide-border rounded border border-border bg-surface">
              {data.items.map((event) => (
                <EventRow key={event.id} event={event} onAcknowledge={() => acknowledge(event.id)} />
              ))}
            </ul>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader className="flex-col items-start gap-1">
            <h2 className="text-sm font-semibold text-fg">{t.seller.tellMeAbout}</h2>
            <p className="text-xs text-muted">{t.seller.tellMeAboutBody}</p>
          </CardHeader>
          <CardBody className="flex flex-col py-2">
            {RULE_TYPES.map((type) => {
              const rule = ruleFor(type);
              return (
                <Checkbox
                  key={type}
                  checked={rule?.isActive ?? false}
                  onChange={(event) => upsertRule({ type, isActive: event.target.checked })}
                  label={t.seller.events[type]}
                  description={
                    rule?.isActive ? tf(t.seller.ruleDetail, { pct: rule.thresholdPct ?? 0, hours: rule.cooldownHours }) : undefined
                  }
                />
              );
            })}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function EventRow({ event, onAcknowledge }: { event: CompetitorEvent; onAcknowledge: () => void }) {
  const { t, fmt, locale } = useI18n();
  const meta = EVENT_META[event.type];
  const Icon = meta.icon;
  const unread = !event.acknowledgedAt;
  const evidenceUrl = safeExternalHref(typeof event.evidence?.url === 'string' ? event.evidence.url : null);
  const dateTime = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <li className={cn('flex items-start gap-3 p-4', unread && 'bg-brand-soft/30')}>
      {meta.savings ? (
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full', meta.tone)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      ) : (
        <Icon className={cn('mt-1 h-4 w-4 shrink-0', meta.tone)} aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-fg">{t.seller.events[event.type]}</span>
          <Badge variant="outline">{event.platform.name}</Badge>
          {event.severity === 'CRITICAL' && <Badge variant="danger">{t.seller.critical}</Badge>}
          {event.severity === 'WARNING' && <Badge variant="warning">{t.seller.warning}</Badge>}
        </div>
        <p className="text-sm text-muted" dir="auto">
          {event.sellerProduct?.name ?? event.canonicalProduct?.title ?? t.seller.unknownProduct}
        </p>
        {event.previousPrice != null && event.newPrice != null && (
          <p className="text-sm tabular-nums text-muted">
            {fmt.currency(event.previousPrice)} <span aria-hidden className="flip-rtl inline-block">→</span>{' '}
            <span className="font-semibold text-fg">{fmt.currency(event.newPrice)}</span>
            {event.changePct != null && (
              <span dir="ltr" className={cn('ms-2', event.changePct < 0 ? 'rounded-sm bg-accent px-1 font-semibold text-accent-fg' : 'text-warning')}>
                {formatSignedPercent(event.changePct)}
              </span>
            )}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <time dateTime={event.detectedAt}>{dateTime.format(new Date(event.detectedAt))}</time>
          {/* The listing the claim came from — evidence, not assertion. */}
          {evidenceUrl && (
            <a href={evidenceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline hover:text-fg">
              {t.seller.viewListing}
            </a>
          )}
        </div>
      </div>
      {unread && (
        <Button size="sm" variant="ghost" leftIcon={<Check className="h-4 w-4" aria-hidden />} onClick={onAcknowledge}>
          {t.seller.gotIt}
        </Button>
      )}
    </li>
  );
}
