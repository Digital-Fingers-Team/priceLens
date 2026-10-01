'use client';

import { useState } from 'react';
import { Check, Copy, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useInviteMember,
  useRemoveMember,
  useRevokeInvite,
  useWorkspaceInvites,
  useWorkspaceMembers,
  useWorkspaces,
} from '@/lib/hooks/use-seller';
import { useFlags } from '@/lib/hooks/use-billing';
import { useI18n } from '@/lib/i18n/provider';
import { useAuthStore } from '@/lib/store/auth.store';
import type { CreatedInvite, OrgRole } from '@/types/seller.types';

/** Members, open invitations, and (for owners and admins) the invite form. */
export function TeamPanel({ orgId }: { orgId: string }) {
  const { t, tf, fmt } = useI18n();
  const me = useAuthStore((s) => s.user);
  const { data: workspaces } = useWorkspaces();
  const role = workspaces?.find((w) => w.id === orgId)?.role;
  const canManage = role === 'OWNER' || role === 'ADMIN';
  const invitesOn = useFlags().isOn('org_invites');

  const { data: members, isLoading } = useWorkspaceMembers(orgId);
  const { data: invites } = useWorkspaceInvites(orgId, canManage && invitesOn);
  const invite = useInviteMember(orgId);
  const revoke = useRevokeInvite(orgId);
  const remove = useRemoveMember(orgId);

  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<OrgRole>('MEMBER');
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is on screen to copy by hand.
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-fg">{t.team.title}</h2>
          <p className="text-sm text-muted">{t.team.lede}</p>
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className="label-mono text-muted">{t.team.members}</h3>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {(members ?? []).map((member) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-fg">
                      {member.user.displayName ?? member.user.username}
                      {member.user.id === me?.id && <span className="text-muted"> ({t.team.you})</span>}
                    </span>
                    <span className="truncate text-xs text-muted" dir="ltr">
                      {member.user.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={member.role === 'OWNER' ? 'brand' : 'neutral'}>{t.team.roles[member.role]}</Badge>
                    {canManage && member.role !== 'OWNER' && member.user.id !== me?.id && (
                      <Button size="sm" variant="ghost" loading={remove.isPending && remove.variables === member.id} onClick={() => remove.mutate(member.id)}>
                        {t.team.remove}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage && invitesOn && (
          <>
            {invites && invites.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="label-mono text-muted">{t.team.invites}</h3>
                <ul className="flex flex-col divide-y divide-border">
                  {invites.map((open) => (
                    <li key={open.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-fg" dir="ltr">
                          {open.email}
                        </span>
                        <span className="text-xs text-muted">{tf(t.team.expires, { date: fmt.date(open.expiresAt) })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{t.team.roles[open.role]}</Badge>
                        <Button size="sm" variant="ghost" loading={revoke.isPending && revoke.variables === open.id} onClick={() => revoke.mutate(open.id)}>
                          {t.team.revoke}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                if (!email.trim()) return;
                invite.mutate(
                  { email: email.trim(), role: newRole },
                  {
                    onSuccess: (result) => {
                      setCreated(result);
                      setEmail('');
                    },
                  },
                );
              }}
            >
              <Input
                label={t.team.email}
                type="email"
                dir="ltr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                wrapperClassName="flex-1"
                required
              />
              <Select
                label={t.team.role}
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as OrgRole)}
                options={[
                  { value: 'MEMBER', label: t.team.roles.MEMBER },
                  { value: 'ADMIN', label: t.team.roles.ADMIN },
                ]}
              />
              <Button type="submit" loading={invite.isPending} leftIcon={<UserPlus className="h-4 w-4" aria-hidden />}>
                {t.team.invite}
              </Button>
            </form>

            {created && (
              <div className="flex flex-col gap-2 rounded border border-brand/30 bg-brand-soft/60 p-4">
                <p className="text-sm font-semibold text-fg">{t.team.linkTitle}</p>
                <p className="text-sm text-muted">
                  {tf(t.team.linkBody, { email: created.email })} {created.emailed && t.team.emailed}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-2 text-xs" dir="ltr">
                    {created.link}
                  </code>
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                    onClick={() => copyLink(created.link)}
                  >
                    {copied ? t.team.copied : t.team.copy}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
