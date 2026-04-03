/**
 * Derives relative_path from folder ancestor names + file_name (authoritative leaf).
 * Segments joined with "/" — no leading slash.
 */
export function buildRelativePathFromFolderNames(
  ancestorNames: string[],
  fileName: string,
): string {
  const parts = [...ancestorNames.map((s) => s.replace(/\/+/g, "").trim()).filter(Boolean), fileName.trim()].filter(
    Boolean,
  );
  return parts.join("/");
}

/** Breadcrumb-style path for display */
export function folderPathNamesToRelativePath(names: string[]): string {
  return names
    .map((s) => s.replace(/\/+/g, "").trim())
    .filter(Boolean)
    .join("/");
}
