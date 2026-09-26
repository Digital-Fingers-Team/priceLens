'use client';

import * as React from 'react';
import { Bell, Plus, Search, Trash2 } from 'lucide-react';
import { LensMark, Wordmark } from '@/components/brand/logo';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import type { Size, Variant } from '@/components/ui/button-styles';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { PriceTag } from '@/components/ui/price-tag';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { TBody, THead, Table, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore } from '@/lib/store/ui.store';

// Literal class names so Tailwind generates them.
const SWATCHES: Array<[string, string]> = [
  ['bg', 'bg-bg'],
  ['surface', 'bg-surface'],
  ['surface-2', 'bg-surface-2'],
  ['border', 'bg-border'],
  ['border-strong', 'bg-border-strong'],
  ['fg', 'bg-fg'],
  ['muted', 'bg-muted'],
  ['brand', 'bg-brand'],
  ['brand-hover', 'bg-brand-hover'],
  ['brand-fg', 'bg-brand-fg'],
  ['brand-soft', 'bg-brand-soft'],
  ['brand-soft-fg', 'bg-brand-soft-fg'],
  ['success', 'bg-success'],
  ['success-soft', 'bg-success-soft'],
  ['warning', 'bg-warning'],
  ['warning-soft', 'bg-warning-soft'],
  ['danger', 'bg-danger'],
  ['danger-soft', 'bg-danger-soft'],
  ['info', 'bg-info'],
  ['info-soft', 'bg-info-soft'],
  ['media', 'bg-media'],
];

const TYPE_SCALE = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'] as const;
const VARIANTS: Variant[] = ['primary', 'secondary', 'outline', 'ghost', 'danger'];
const SIZES: Size[] = ['sm', 'md', 'lg'];
const BADGES: BadgeVariant[] = ['neutral', 'brand', 'success', 'warning', 'danger', 'info', 'outline'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8">
      <h2 className="label-mono text-muted">{title}</h2>
      {children}
    </section>
  );
}

export function DesignSystem() {
  const { t, locale, dir } = useI18n();
  const addToast = useUiStore((s) => s.addToast);
  const [tab, setTab] = React.useState<'week' | 'month' | 'year'>('week');
  const [dialog, setDialog] = React.useState<'modal' | 'sheet' | null>(null);

  return (
    <div className="mx-auto flex max-w-page flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-fg">Design system</h1>
        <p className="text-sm text-muted">
          {locale} · {dir} · switch theme and language in the navbar. Development only.
        </p>
      </header>

      <Section title="Brand">
        <div className="flex flex-wrap items-center gap-6 text-fg">
          <Wordmark className="h-8 w-auto" />
          <LensMark className="h-10 w-10 text-brand" />
        </div>
      </Section>

      <Section title="Color tokens">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SWATCHES.map(([name, cls]) => (
            <li key={name} className="flex items-center gap-3">
              <span className={`h-10 w-10 shrink-0 rounded border border-border ${cls}`} />
              <code className="font-mono text-xs text-fg">{name}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-2 text-fg">
          {TYPE_SCALE.map((size) => (
            <p key={size} className={size}>
              <span className="font-mono text-xs text-muted">{size} </span>
              {t.home.lede}
            </p>
          ))}
          <p className="font-medium">font-medium · {t.common.loading}</p>
          <p className="font-semibold">font-semibold · {t.common.loading}</p>
          <p className="label-mono text-muted">label-mono</p>
        </div>
      </Section>

      <Section title="Buttons">
        {SIZES.map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-3">
            {VARIANTS.map((variant) => (
              <Button key={variant} type="button" variant={variant} size={size}>
                {variant}
              </Button>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" leftIcon={<Plus className="h-4 w-4" aria-hidden />}>
            With icon
          </Button>
          <Button type="button" loading>
            Loading
          </Button>
          <Button type="button" disabled>
            Disabled
          </Button>
          <IconButton aria-label="Notifications">
            <Bell className="h-5 w-5" aria-hidden />
          </IconButton>
          <IconButton aria-label="Delete" variant="danger">
            <Trash2 className="h-5 w-5" aria-hidden />
          </IconButton>
          <Spinner />
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          {BADGES.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
          <Badge variant="success" dot>
            {t.product.inStock}
          </Badge>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Default" placeholder={t.search.placeholder} leftIcon={<Search className="h-4 w-4" aria-hidden />} />
          <Input label="With hint" hint="Helper text under the field." />
          <Input label="With error" defaultValue="not-an-email" error="Enter a valid email address." />
          <Input label="Disabled" disabled defaultValue="Disabled" />
          <Select
            label="Select"
            placeholder="All categories"
            options={[
              { value: 'phones', label: 'Phones' },
              { value: 'laptops', label: 'Laptops' },
            ]}
          />
          <Select label="Select, error" error="Pick one." options={[{ value: 'a', label: 'Option' }]} />
          <Checkbox label="Checkbox" description="With a description line." />
          <Checkbox label="Checked" defaultChecked />
          <Checkbox label="Disabled" disabled />
        </div>
      </Section>

      <Section title="Tabs and pagination">
        <Tabs
          label="Range"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: 'week', label: '7D' },
            { value: 'month', label: '30D' },
            { value: 'year', label: '1Y' },
          ]}
        />
        <Pagination page={4} totalPages={12} hrefFor={(p) => `?page=${p}`} />
      </Section>

      <Section title="Cards and prices">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-fg">Card</h3>
            </CardHeader>
            <CardBody className="flex flex-col gap-2">
              <PriceTag amount={24999} size="lg" emphasis />
              <PriceTag amount={21499} was={25999} />
              <PriceTag amount={null} size="sm" />
            </CardBody>
          </Card>
          <Card interactive>
            <CardBody className="flex flex-col gap-3">
              <p className="text-sm text-fg">Interactive card (hover me)</p>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardBody>
          </Card>
          <Card className="glass">
            <CardBody>
              <p className="text-sm text-fg">.glass surface</p>
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section title="Table">
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <Th>Store</Th>
                <Th align="end">Price</Th>
              </tr>
            </THead>
            <TBody>
              <tr>
                <Td>Amazon</Td>
                <Td align="end">
                  <PriceTag amount={24999} size="sm" />
                </Td>
              </tr>
              <tr>
                <Td>Noon</Td>
                <Td align="end">
                  <PriceTag amount={25499} size="sm" />
                </Td>
              </tr>
            </TBody>
          </Table>
        </div>
      </Section>

      <Section title="States">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <EmptyState icon={<Search className="h-5 w-5" />} title="Nothing here" description="An empty state." />
          </Card>
          <Card>
            <ErrorState
              title="Something went wrong"
              description="An error state."
              action={
                <Button type="button" variant="secondary" size="sm">
                  {t.common.retry}
                </Button>
              }
            />
          </Card>
        </div>
      </Section>

      <Section title="Overlays and toasts">
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={() => setDialog('modal')}>
            Open modal
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDialog('sheet')}>
            Open sheet
          </Button>
          {(['success', 'error', 'info', 'warning'] as const).map((variant) => (
            <Button key={variant} type="button" variant="outline" onClick={() => addToast(`A ${variant} toast`, variant)}>
              Toast: {variant}
            </Button>
          ))}
        </div>
        <Dialog
          open={dialog !== null}
          onClose={() => setDialog(null)}
          variant={dialog ?? 'modal'}
          title={dialog === 'sheet' ? 'Bottom sheet' : 'Modal'}
          description="Esc, the close button or the backdrop closes it."
          footer={
            <Button type="button" onClick={() => setDialog(null)}>
              {t.common.close}
            </Button>
          }
        >
          <p className="text-sm text-fg">Dialog body.</p>
        </Dialog>
      </Section>
    </div>
  );
}
