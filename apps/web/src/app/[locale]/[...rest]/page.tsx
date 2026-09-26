import { notFound } from 'next/navigation';

// Any unknown path inside a locale renders that locale's not-found page
// (with the header, footer and language) instead of Next's bare root 404.
export default function CatchAll() {
  notFound();
}
