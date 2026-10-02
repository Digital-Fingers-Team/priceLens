'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageCircleQuestion, Send } from 'lucide-react';
import { UpgradePrompt } from '@/components/billing/upgrade-prompt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { apiClient } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import { useEntitlement } from '@/lib/hooks/use-billing';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import type { ApiResponse } from '@/types/api.types';
import { SignedInGate } from '../account/signed-in-gate';

interface AdvisorPick {
  product: { productId: string; slug: string; title: string; price: number | null; currency: string; storeCount: number; dealGrade: string | null };
  why: string;
  tradeoff: string | null;
}
interface AdvisorAnswer {
  query: string;
  interpretation: string;
  picks: AdvisorPick[];
  generatedBy: 'model' | 'rules';
  notice: string | null;
}

/** "What should I buy?" — three products we track, why each fits, and the trade-off. */
export default function AdvisorPage() {
  const { t } = useI18n();
  return (
    <SignedInGate path="/advisor" prompt={t.advisor.signIn}>
      <Advisor />
    </SignedInGate>
  );
}

function Advisor() {
  const { t, fmt } = useI18n();
  const access = useEntitlement('advisor');
  const apiError = useApiErrorMessage();
  const [message, setMessage] = useState('');
  const ask = useMutation({
    mutationFn: async (text: string) => (await apiClient.post<ApiResponse<AdvisorAnswer>>('/advisor', { message: text })).data.data,
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
          <MessageCircleQuestion className="h-5 w-5 text-brand" aria-hidden />
          {t.advisor.title}
        </h1>
        <p className="text-sm text-muted">{t.advisor.lede}</p>
      </header>

      {access === 'loading' ? (
        <Skeleton className="h-32 w-full" />
      ) : access === 'hidden' ? (
        <EmptyState title={t.advisor.unavailable} />
      ) : access === 'locked' ? (
        <UpgradePrompt title={t.advisor.lockedTitle} description={t.advisor.lockedBody} />
      ) : (
        <>
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (message.trim().length >= 3) ask.mutate(message.trim());
            }}
          >
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t.advisor.placeholder}
              maxLength={500}
              rows={3}
              dir="auto"
              className="w-full rounded border border-border-strong bg-surface p-3 text-sm text-fg placeholder:text-muted focus-visible:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand/40"
            />
            <Button type="submit" className="self-end" loading={ask.isPending} leftIcon={<Send className="flip-rtl h-4 w-4" aria-hidden />}>
              {t.advisor.ask}
            </Button>
          </form>

          {ask.isPending && <Skeleton className="h-64 w-full" />}
          {ask.isError && <ErrorState title={apiError(ask.error)} />}
          {ask.data && (
            <section className="flex flex-col gap-4" aria-live="polite">
              <p className="text-sm text-muted">{ask.data.interpretation}</p>
              {ask.data.picks.length === 0 ? (
                <EmptyState title={t.advisor.noneTitle} description={t.advisor.noneBody} />
              ) : (
                ask.data.picks.map((pick, index) => (
                  <Card key={pick.product.productId}>
                    <CardBody className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/products/${pick.product.slug}`} className="font-semibold text-fg hover:text-brand" dir="auto">
                          {index + 1}. {pick.product.title}
                        </Link>
                        {pick.product.price !== null && (
                          <span className="font-semibold tabular-nums text-fg">{fmt.currency(pick.product.price, pick.product.currency)}</span>
                        )}
                      </div>
                      <p className="text-sm text-fg" dir="auto">
                        {pick.why}
                      </p>
                      {pick.tradeoff && (
                        <p className="text-sm text-muted" dir="auto">
                          <Badge variant="outline">{t.advisor.tradeoff}</Badge> {pick.tradeoff}
                        </p>
                      )}
                    </CardBody>
                  </Card>
                ))
              )}
              <p className="text-xs text-muted">{ask.data.generatedBy === 'model' ? t.advisor.groundedNote : t.advisor.rulesNote}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
