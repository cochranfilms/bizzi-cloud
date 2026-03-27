/**
 * Fields stored on backup_files for macOS package reconstruction (group by root path + kind).
 */

import { MACOS_PACKAGE_EXTENSION_KIND_ENTRIES } from "@/lib/macos-package-bundles";

export type MacosPackageFirestoreFields = {
  macos_package_kind?: string;
  macos_package_root_relative_path?: string;
};

/** Longest suffix match inside any path segment (handles MyProject.fcpbundle/…). */
export function macosPackageFirestoreFieldsFromRelativePath(
  relativePath: string
): MacosPackageFirestoreFields {
  const safe = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  const segments = safe.split("/").filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    const lower = segments[i].toLowerCase();
    for (const { suffix, kind } of MACOS_PACKAGE_EXTENSION_KIND_ENTRIES) {
      if (lower.endsWith(suffix)) {
        return {
          macos_package_kind: kind,
          macos_package_root_relative_path: segments.slice(0, i + 1).join("/"),
        };
      }
    }
  }
  return {};
}

