/** Safe in-app path (+ optional hash) to return users after migration OAuth. */

export const MIGRATION_OAUTH_DEFAULT_RETURN = "/dashboard/settings#migration";

export function sanitizeMigrationOAuthReturnPath(raw: unknown): string {
  if (typeof raw !== "string") return MIGRATION_OAUTH_DEFAULT_RETURN;
  const t = raw.trim();
  if (t.length === 0 || t.length > 2048) return MIGRATION_OAUTH_DEFAULT_RETURN;
  if (!t.startsWith("/") || t.startsWith("//")) return MIGRATION_OAUTH_DEFAULT_RETURN;
  if (t.includes("\\") || t.includes("\0")) return MIGRATION_OAUTH_DEFAULT_RETURN;
  const lowered = t.toLowerCase();
  if (lowered.includes("://")) return MIGRATION_OAUTH_DEFAULT_RETURN;
  if (lowered.startsWith("javascript:") || lowered.startsWith("data:")) {
    return MIGRATION_OAUTH_DEFAULT_RETURN;
  }
  return t;
}

export function appendMigrationOAuthQuery(returnPath: string, query: Record<string, string>): string {
  const hashIdx = returnPath.indexOf("#");
  const pathOnly = hashIdx === -1 ? returnPath : returnPath.slice(0, hashIdx);
  const hash = hashIdx === -1 ? "" : returnPath.slice(hashIdx);
  const hasQuery = pathOnly.includes("?");
  const sep = hasQuery ? "&" : "?";
  const q = new URLSearchParams(query).toString();
  return `${pathOnly}${sep}${q}${hash}`;
}

export function migrationOAuthAbsoluteRedirect(
  appBase: string,
  returnPath: string,
  query: Record<string, string>
): string {
  const pathWithQuery = appendMigrationOAuthQuery(returnPath, query);
  const base = appBase.replace(/\/$/, "");
  return `${base}${pathWithQuery}`;
}
