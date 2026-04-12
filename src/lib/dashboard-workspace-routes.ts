/** Routes that use DashboardAppearanceProvider chrome (custom page background + derived UI mode). */
export function isDashboardWorkspacePath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/enterprise") ||
    pathname.startsWith("/desktop/app") ||
    /^\/team\/[^/]+/.test(pathname)
  );
}
