/**
 * Root desktop layout. The landing page at /desktop renders here without auth.
 * The app at /desktop/app/* uses its own layout with auth guard.
 */
export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
