import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DesignSystem } from './design-system';

export const metadata: Metadata = { title: 'Design system', robots: { index: false, follow: false } };

/**
 * Every token and component in every state (audit 07). Development only:
 * switch theme and language with the navbar controls to see all four
 * combinations.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignSystem />;
}
