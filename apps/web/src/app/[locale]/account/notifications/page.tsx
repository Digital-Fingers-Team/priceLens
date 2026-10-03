'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useEnableWebPush,
  useNotificationChannels,
  useSetChannelActive,
  useUpsertChannel,
  useVerifyChannel,
} from '@/lib/hooks/use-notifications';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import type { NotificationChannelType } from '@/types/billing.types';
import { SignedInGate } from '../signed-in-gate';

const CHANNELS: NotificationChannelType[] = ['IN_APP', 'EMAIL', 'TELEGRAM', 'WEB_PUSH'];
const PLACEHOLDER: Record<NotificationChannelType, string> = { IN_APP: '', EMAIL: 'you@example.com', TELEGRAM: '@yourusername', WEB_PUSH: '' };

export default function NotificationSettingsPage() {
  const { t } = useI18n();
  return (
    <SignedInGate path="/account/notifications" prompt={t.channels.signInPrompt}>
      <Settings />
    </SignedInGate>
  );
}

function Settings() {
  const { t } = useI18n();
  const { data, isLoading } = useNotificationChannels();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-fg">{t.nav.notifications}</h1>
        <p className="text-sm text-muted">{t.channels.lede}</p>
      </header>

      {isLoading || !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {CHANNELS.map((type) => (
            <ChannelCard
              key={type}
              type={type}
              channel={data.channels.find((entry) => entry.type === type)}
              availability={data.available[type]}
              webPushPublicKey={data.webPushPublicKey ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type Channels = NonNullable<ReturnType<typeof useNotificationChannels>['data']>['channels'];

function ChannelCard({
  type,
  channel,
  availability,
  webPushPublicKey,
}: {
  type: NotificationChannelType;
  channel: Channels[number] | undefined;
  availability: { configured: boolean; allowed: boolean } | undefined;
  webPushPublicKey: string | null;
}) {
  const { t, tf, tp } = useI18n();
  const copy = t.channels.types[type];

  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');

  const { mutate: upsert, isPending: saving } = useUpsertChannel();
  const { mutate: verify, isPending: verifying } = useVerifyChannel();
  const { mutate: setActive } = useSetChannelActive();
  const enablePush = useEnableWebPush();

  const isInApp = type === 'IN_APP';
  const allowed = availability?.allowed ?? false;
  const configured = availability?.configured ?? false;
  const awaitingVerification = Boolean(channel && !channel.verified);

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-fg">{copy.label}</h2>
          {channel?.verified && <Badge variant="success">{t.channels.verified}</Badge>}
          {awaitingVerification && <Badge variant="warning">{t.channels.needsVerifying}</Badge>}
          {isInApp && <Badge variant="info">{t.channels.alwaysOn}</Badge>}
        </div>
        {!isInApp && channel?.verified && (
          <Checkbox
            className="min-h-0 py-0"
            checked={channel.isActive}
            onChange={(event) => setActive({ type, isActive: event.target.checked })}
            label={t.channels.deliverHere}
          />
        )}
      </CardHeader>

      <CardBody className="flex flex-col gap-3">
        <p className="text-sm text-muted">{copy.help}</p>

        {/* Honest about *why* something is unavailable: a plan limit and an
            unconfigured deployment are different problems with different fixes. */}
        {!isInApp && !allowed && (
          <p className="rounded border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-fg">
            {tf(t.channels.notInPlan, { channel: copy.label })}{' '}
            <Link href="/pricing" className="font-medium text-brand-text underline">
              {t.billing.seePlans}
            </Link>
          </p>
        )}
        {!isInApp && allowed && !configured && (
          <p className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
            {tf(t.channels.notConfigured, { channel: copy.label })}
          </p>
        )}

        {type === 'WEB_PUSH' && allowed && configured && webPushPublicKey && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {channel?.destination && (
              <p className="flex-1 text-xs text-muted">
                {t.channels.currently} <span className="font-mono text-fg" dir="ltr">{channel.destination}</span>
              </p>
            )}
            <Button variant="secondary" className="self-start" loading={enablePush.isPending} onClick={() => enablePush.mutate(webPushPublicKey)}>
              {t.channels.enableBrowser}
            </Button>
          </div>
        )}

        {!isInApp && type !== 'WEB_PUSH' && allowed && (
          <>
            {channel?.destination && (
              <p className="text-xs text-muted">
                {t.channels.currently} <span className="font-mono text-fg" dir="ltr">{channel.destination}</span>
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder={PLACEHOLDER[type]}
                label={tf(t.channels.destination, { channel: copy.label })}
                dir="ltr"
                wrapperClassName="flex-1"
              />
              <Button
                variant="secondary"
                loading={saving}
                disabled={!destination.trim() || !configured}
                onClick={() => upsert({ type, destination: destination.trim() })}
              >
                {channel ? t.channels.change : t.channels.add}
              </Button>
            </div>

            {awaitingVerification && (
              <div className="flex flex-col gap-2 rounded border border-border bg-surface-2 p-3 sm:flex-row sm:items-end">
                {type === 'EMAIL' ? (
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    label={t.channels.code}
                    dir="ltr"
                    inputMode="numeric"
                    wrapperClassName="flex-1"
                  />
                ) : (
                  <p className="flex-1 text-xs text-muted">{t.channels.telegramSteps}</p>
                )}
                <Button leftIcon={<Check className="h-4 w-4" aria-hidden />} loading={verifying} onClick={() => verify({ type, code: code.trim() || undefined })}>
                  {t.channels.confirm}
                </Button>
              </div>
            )}

            {channel && channel.failureCount > 0 && (
              <p className="text-xs text-warning">{tp(t.channels.failures, channel.failureCount)}</p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
