'use client';

import { useParams } from 'next/navigation';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Card, CardBody } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { useAcceptInvite, useInvitePreview } from '@/lib/hooks/use-seller';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useAuthStore } from '@/lib/store/auth.store';
import { loginHref } from '@/lib/utils/next-path';

/** A workspace invitation link: who invited you to what, then accept. */
export default function InvitePage() {
  const { t, tf } = useI18n();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { data, isLoading, isError } = useInvitePreview(token);
  const accept = useAcceptInvite();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  if (isLoading || !hasHydrated) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <EmptyState title={t.invite.invalidTitle} description={t.invite.invalidBody} />
      </div>
    );
  }

  const role = t.team.roles[data.role];
  const signedInAsInvitee = user?.email?.toLowerCase() === data.email.toLowerCase();

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <Users className="h-5 w-5 text-brand" aria-hidden />
            <span dir="auto">{tf(t.invite.title, { workspace: data.workspace })}</span>
          </h1>
          <p className="text-sm text-fg" dir="auto">
            {tf(t.invite.body, { workspace: data.workspace, role })}
          </p>
          <p className="text-sm text-muted">
            {tf(t.invite.forEmail, { email: data.email })}
          </p>
          {signedInAsInvitee ? (
            <Button
              className="self-start"
              loading={accept.isPending}
              onClick={() => accept.mutate(token, { onSuccess: (joined) => router.replace(`/seller/${joined.orgId}`) })}
            >
              {t.invite.accept}
            </Button>
          ) : (
            <>
              <p className="text-sm text-muted">{t.invite.signIn}</p>
              <Link href={loginHref(`/invite/${token}`)} className={buttonClassName({ className: 'self-start' })}>
                {t.common.signIn}
              </Link>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
