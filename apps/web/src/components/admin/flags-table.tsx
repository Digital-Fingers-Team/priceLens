'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, THead, Td, Th } from '@/components/ui/table';
import { useAdminFlags, useSetFlag } from '@/lib/hooks/use-billing';

const SOURCE_LABEL = { database: 'Set here', environment: 'From .env', default: 'Default' } as const;

/** Every feature switch: flip it, or reset it to the environment / default. */
export function FlagsTable() {
  const { data, isLoading } = useAdminFlags();
  const setFlag = useSetFlag();

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <Card>
      <Table>
        <THead>
          <tr>
            <Th>Flag</Th>
            <Th>State</Th>
            <Th>Source</Th>
            <Th align="end">Actions</Th>
          </tr>
        </THead>
        <TBody>
          {data.map((flag) => {
            const pending = setFlag.isPending && setFlag.variables?.key === flag.key;
            return (
              <tr key={flag.key}>
                <Td>
                  <code className="text-sm text-fg">{flag.key}</code>
                  <span className="block text-xs text-muted">{flag.description}</span>
                </Td>
                <Td>
                  <Badge variant={flag.enabled ? 'success' : 'neutral'} dot>
                    {flag.enabled ? 'On' : 'Off'}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-sm text-muted">
                  {SOURCE_LABEL[flag.source]}
                  {flag.source !== 'default' && <span className="block text-xs">default {flag.defaultOn ? 'on' : 'off'}</span>}
                </Td>
                <Td align="end">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant={flag.enabled ? 'secondary' : 'primary'}
                      loading={pending && setFlag.variables?.enabled !== null}
                      onClick={() => setFlag.mutate({ key: flag.key, enabled: !flag.enabled })}
                    >
                      {flag.enabled ? 'Turn off' : 'Turn on'}
                    </Button>
                    {flag.source === 'database' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={pending && setFlag.variables?.enabled === null}
                        onClick={() => setFlag.mutate({ key: flag.key, enabled: null })}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}
