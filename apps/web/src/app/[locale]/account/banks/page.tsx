'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useBanks, useSetBanks } from '@/lib/hooks/use-buyer';
import { useI18n } from '@/lib/i18n/provider';
import { SignedInGate } from '../signed-in-gate';

/** Which banks the buyer has cards with, so their card offers come first. Names only. */
export default function BanksPage() {
  const { t } = useI18n();
  return (
    <SignedInGate path="/account/banks" prompt={t.banks.signIn}>
      <Banks />
    </SignedInGate>
  );
}

function Banks() {
  const { t } = useI18n();
  const { data, isLoading } = useBanks();
  const save = useSetBanks();
  const [mine, setMine] = useState<string[]>([]);
  const [other, setOther] = useState('');
  useEffect(() => setMine(data?.mine ?? []), [data]);

  const toggle = (bank: string) => setMine((list) => (list.includes(bank) ? list.filter((b) => b !== bank) : [...list, bank]));
  const choices = [...new Set([...(data?.known ?? []), ...mine])].sort();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-fg">{t.banks.title}</h1>
        <p className="text-sm text-muted">{t.banks.lede}</p>
      </header>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {choices.length === 0 && <p className="text-sm text-muted">{t.banks.none}</p>}
              {choices.map((bank) => (
                <button key={bank} type="button" onClick={() => toggle(bank)} aria-pressed={mine.includes(bank)}>
                  <Badge variant={mine.includes(bank) ? 'brand' : 'outline'}>
                    {mine.includes(bank) ? <Check className="h-3 w-3" aria-hidden /> : null} {bank}
                  </Badge>
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const name = other.trim();
                if (name && !mine.includes(name)) setMine([...mine, name]);
                setOther('');
              }}
            >
              <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder={t.banks.addPlaceholder} wrapperClassName="flex-1" maxLength={64} />
              <Button type="submit" variant="secondary">
                {t.banks.add}
              </Button>
            </form>
            <div className="flex flex-wrap items-center gap-2">
              <Button loading={save.isPending} onClick={() => save.mutate(mine)}>
                {t.banks.save}
              </Button>
              {mine.length > 0 && (
                <Button variant="ghost" leftIcon={<X className="h-4 w-4" aria-hidden />} onClick={() => setMine([])}>
                  {t.banks.clear}
                </Button>
              )}
              {save.isSuccess && <span className="text-xs text-success">{t.banks.saved}</span>}
            </div>
            <p className="text-xs text-muted">{t.banks.privacy}</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
