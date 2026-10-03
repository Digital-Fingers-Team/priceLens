'use client';

import { Code2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, TBody, Td, Th, THead } from '@/components/ui/table';
import { useI18n } from '@/lib/i18n/provider';

const BASE = 'https://pricelens.store/api/v1/partner';

/** The public API documentation: what a key opens, in plain terms. */
export default function DevelopersPage() {
  const { t, tf } = useI18n();
  const d = t.developers;
  const routes = [
    { path: '/search?q={text}', scope: 'market:read', text: d.route.search },
    { path: '/products/{id}/market?days=90', scope: 'market:read', text: d.route.market },
    { path: '/market/stats?brand={brand}', scope: 'market:read', text: d.route.stats },
    { path: '/events?type={type}&since={date}', scope: 'events:read', text: d.route.events },
    { path: '/whoami', scope: '—', text: d.route.whoami },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
          <Code2 className="h-5 w-5 text-brand" aria-hidden />
          {d.title}
        </h1>
        <p className="text-sm text-muted">{d.lede}</p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-fg">{d.auth}</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="text-sm text-muted">{d.authBody}</p>
          <pre className="overflow-x-auto rounded bg-surface-2 p-3 font-mono text-xs text-fg" dir="ltr">
            {`curl -H "Authorization: Bearer pl_live_..." \\\n  "${BASE}/search?q=iphone%2015"`}
          </pre>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-fg">{d.endpoints}</h2>
        </CardHeader>
        <Table wide>
          <THead>
            <tr>
              <Th>GET</Th>
              <Th>{d.scope}</Th>
              <Th> </Th>
            </tr>
          </THead>
          <TBody>
            {routes.map((route) => (
              <tr key={route.path}>
                <Td className="font-mono text-xs" dir="ltr">
                  {route.path}
                </Td>
                <Td className="font-mono text-xs text-muted" dir="ltr">
                  {route.scope}
                </Td>
                <Td className="text-sm text-muted">{route.text}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
        <CardBody>
          <p className="text-xs text-muted" dir="ltr">
            Base URL: {BASE}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-fg">{d.limits}</h2>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-muted">{d.limitsBody}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-fg">{d.conventions}</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="text-sm text-muted">{tf(d.conventionsBody, { currency: 'EGP' })}</p>
        </CardBody>
      </Card>
    </div>
  );
}
