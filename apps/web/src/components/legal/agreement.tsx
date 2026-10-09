'use client';
import { Fragment } from 'react';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';

type LinkedDoc = 'terms' | 'privacy' | 'refunds';

/**
 * A sentence with links to legal pages in it: `{terms}` in the template
 * becomes a link to /legal/terms labelled t.legal.links.terms. Links open
 * in a new tab so a half-filled form is not lost.
 */
export function Agreement({ template }: { template: string }) {
  const { t } = useI18n();
  const parts = template.split(/\{(terms|privacy|refunds)\}/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Link
            key={i}
            href={`/legal/${part}`}
            target="_blank"
            className="font-medium text-brand-text underline underline-offset-2 hover:no-underline"
          >
            {t.legal.links[part as LinkedDoc]}
          </Link>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
