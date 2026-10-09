import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Link } from '@/lib/i18n/navigation';
import { getI18n, resolveLocale } from '@/lib/i18n/server';
import { LEGAL_SLUGS, LEGAL_UPDATED, SUPPORT_EMAIL, isLegalSlug, legalDoc, type LegalSlug } from '@/lib/legal';
import { localizedAlternates } from '@/lib/seo';
import { cn } from '@/lib/utils/cn';

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Every page is static: the text only changes with a deploy. */
export const dynamicParams = false;

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }));
}

async function resolve(params: Props['params']): Promise<{ locale: Awaited<ReturnType<typeof resolveLocale>>; slug: LegalSlug }> {
  const locale = await resolveLocale(params);
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  return { locale, slug };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await resolve(params);
  const doc = legalDoc(locale, slug);
  return {
    title: doc.title,
    description: doc.description,
    alternates: localizedAlternates(locale, `/legal/${slug}`),
  };
}

/** Terms, privacy, refund and cookie policies (lib/legal has the text). */
export default async function LegalPage({ params }: Props) {
  const { locale, slug } = await resolve(params);
  const { t, tf, fmt } = getI18n(locale);
  const doc = legalDoc(locale, slug);

  return (
    <div className="mx-auto flex max-w-page flex-col gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:gap-16">
      <nav aria-label={t.legal.label} className="lg:w-56 lg:shrink-0">
        <ul className="flex flex-wrap gap-2 lg:sticky lg:top-24 lg:flex-col lg:gap-1">
          {LEGAL_SLUGS.map((other) => (
            <li key={other}>
              <Link
                href={`/legal/${other}`}
                aria-current={other === slug ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm transition-colors',
                  other === slug ? 'bg-surface-2 font-medium text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {t.legal.docs[other]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <article className="flex min-w-0 max-w-prose flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-fg">{doc.title}</h1>
          <p className="text-pretty text-muted">{doc.description}</p>
          <p className="label-mono text-muted">
            {tf(t.legal.updated, { date: fmt.date(LEGAL_UPDATED) })}
          </p>
        </header>

        {doc.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-fg">{section.heading}</h2>
            {section.body.map((block, i) =>
              Array.isArray(block) ? (
                <ul key={i} className="flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-fg marker:text-muted">
                  {block.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={i} className="text-pretty text-sm leading-relaxed text-fg">
                  {block}
                </p>
              ),
            )}
          </section>
        ))}

        <p className="border-t border-border pt-6 text-sm text-muted">
          {t.legal.questions}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-text hover:underline" dir="ltr">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </article>
    </div>
  );
}
