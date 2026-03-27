/**
 * Pure helpers for dashboard synthetic rows (`macos-pkg:${containerDocId}`).
 * Kept separate from server-only file-access / firebase-admin.
 */

/** UI synthetic id for a macOS package row (`macos-pkg:${containerDocId}`). */
export const MACOS_PACKAGE_SYNTHETIC_FILE_ID_PREFIX = "macos-pkg:";

export function isMacosPackageSyntheticFileId(fileId: string): boolean {
  return typeof fileId === "string" && fileId.startsWith(MACOS_PACKAGE_SYNTHETIC_FILE_ID_PREFIX);
}

export function parseMacosPackageIdFromSyntheticFileId(fileId: string): string | null {
  if (!isMacosPackageSyntheticFileId(fileId)) return null;
  const rest = fileId.slice(MACOS_PACKAGE_SYNTHETIC_FILE_ID_PREFIX.length);
  return rest.length > 0 ? rest : null;
}
