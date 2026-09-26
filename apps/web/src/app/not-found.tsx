// Reached only by paths the locale middleware skips (e.g. a missing file).
export default function RootNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-bg text-fg">
        <p className="font-mono text-sm">404</p>
      </body>
    </html>
  );
}
