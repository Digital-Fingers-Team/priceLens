import './globals.css';

// The real root layout (<html lang dir>) is app/[locale]/layout.tsx; this
// one only exists because Next requires a layout at the app root.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
