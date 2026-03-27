/**
 * Client-safe notification routing key from URL (no firebase-admin).
 */
export function clientNotificationRouting(
  pathname: string | null | undefined,
  enterpriseOrgId: string | null | undefined
): string {
  if (!pathname) return "consumer";
  if (pathname.startsWith("/enterprise")) {
    return enterpriseOrgId ? `enterprise:${enterpriseOrgId}` : "consumer";
  }
  const team = pathname.match(/^\/team\/([^/]+)/);
  if (team?.[1]) return `team:${team[1]}`;
  const desktopTeam = pathname.match(/^\/desktop\/app\/team\/([^/]+)/);
  if (desktopTeam?.[1]) return `team:${desktopTeam[1]}`;
  return "consumer";
}
