'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Inbox, Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useNotificationChannels,
  useSetChannelActive,
  useUpsertChannel,
  useVerifyChannel,
} from '@/lib/hooks/use-notifications';
import { useAuthStore } from '@/lib/store/auth.store';
import type { NotificationChannelType } from '@/types/billing.types';

const CHANNEL_META: Record<
  NotificationChannelType,
  { label: string; icon: typeof Mail; placeholder: string; help: string }
> = {
  IN_APP: {
    label: 'In-app inbox',
    icon: Inbox,
    placeholder: '',
    help: 'Always on. Every alert is recorded here even if another channel fails.',
  },
  EMAIL: {
    label: 'Email',
    icon: Mail,
    placeholder: 'you@example.com',
    help: 'We send a short code to confirm the address before delivering anything to it.',
  },
  TELEGRAM: {
    label: 'Telegram',
    icon: MessageCircle,
    placeholder: '@yourusername',
    help: 'Telegram bots cannot message you first, so you send our bot the code and we match it up.',
  },
};

export default function NotificationSettingsPage() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  const { data, isLoading } = useNotificationChannels();

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-sm text-ink-400">
          <Link href="/login" className="text-signal hover:underline">
            Sign in
          </Link>{' '}
          to manage how you are notified.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-50">Notifications</h1>
        <p className="mt-1 text-sm text-ink-400">
          Where PriceLens reaches you when one of your alerts fires.
        </p>
      </header>

      {isLoading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {(Object.keys(CHANNEL_META) as NotificationChannelType[]).map((type) => (
            <ChannelCard
              key={type}
              type={type}
              channel={data.channels.find((entry) => entry.type === type)}
              availability={data.available[type]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelCard({
  type,
  channel,
  availability,
}: {
  type: NotificationChannelType;
  channel: ReturnType<typeof useNotificationChannels>['data'] extends infer T
    ? T extends { channels: Array<infer C> }
      ? C | undefined
      : never
    : never;
  availability: { configured: boolean; allowed: boolean } | undefined;
}) {
  const meta = CHANNEL_META[type];
  const Icon = meta.icon;

  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');

  const { mutate: upsert, isPending: saving } = useUpsertChannel();
  const { mutate: verify, isPending: verifying } = useVerifyChannel();
  const { mutate: setActive } = useSetChannelActive();

  const isInApp = type === 'IN_APP';
  const allowed = availability?.allowed ?? false;
  const configured = availability?.configured ?? false;
  const awaitingVerification = Boolean(channel && !channel.verified);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-ink-400" aria-hidden />
          <h2 className="text-sm font-semibold text-ink-100">{meta.label}</h2>
          {channel?.verified && <Badge variant="success">Verified</Badge>}
          {awaitingVerification && <Badge variant="warning">Needs verifying</Badge>}
          {isInApp && <Badge variant="info">Always on</Badge>}
        </div>

        {!isInApp && channel?.verified && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-400">
            <input
              type="checkbox"
              checked={channel.isActive}
              onChange={(event) => setActive({ type, isActive: event.target.checked })}
              className="h-4 w-4 rounded border-ink-600 bg-ink-800 accent-[color:var(--signal,#22d3ee)]"
            />
            Deliver here
          </label>
        )}
      </CardHeader>

      <CardBody className="space-y-3">
        <p className="text-xs leading-relaxed text-ink-500">{meta.help}</p>

        {/* Honest about *why* something is unavailable: a plan limit and an
            unconfigured deployment are different problems with different fixes. */}
        {!isInApp && !allowed && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
            {meta.label} delivery is not included in your plan.{' '}
            <Link href="/pricing" className="font-medium underline">
              See plans
            </Link>
          </div>
        )}

        {!isInApp && allowed && !configured && (
          <div className="rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs text-ink-400">
            {meta.label} is not configured on this deployment yet, so nothing can be delivered there.
          </div>
        )}

        {!isInApp && allowed && (
          <>
            {channel?.destination && (
              <p className="text-xs text-ink-400">
                Currently: <span className="font-mono text-ink-200">{channel.destination}</span>
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder={meta.placeholder}
                aria-label={`${meta.label} destination`}
                className="flex-1"
              />
              <Button
                variant="ghost"
                loading={saving}
                disabled={!destination.trim() || !configured}
                onClick={() => upsert({ type, destination: destination.trim() })}
              >
                {channel ? 'Change' : 'Add'}
              </Button>
            </div>

            {awaitingVerification && (
              <div className="flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-950/60 p-3 sm:flex-row">
                {type === 'EMAIL' ? (
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Verification code"
                    aria-label="Verification code"
                    className="flex-1"
                  />
                ) : (
                  <p className="flex-1 text-xs text-ink-400">
                    Send the code we showed you to the PriceLens bot on Telegram, then confirm here.
                  </p>
                )}
                <Button
                  leftIcon={<Check className="h-4 w-4" />}
                  loading={verifying}
                  onClick={() => verify({ type, code: code.trim() || undefined })}
                >
                  Confirm
                </Button>
              </div>
            )}

            {channel && channel.failureCount > 0 && (
              <p className="text-xs text-amber-400">
                {channel.failureCount} recent delivery failure(s) to this destination.
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
