/**
 * macOS "packages" — directories Finder shows as single files (.fcpbundle, .photoslibrary, etc.).
 *
 * This is the client side of a **storage + upload workflow** for package-based creative containers
 * (`macos_package_*` fields on backup_files, structured relative_path trees, recursive drag/drop).
 * It is not an extension allowlist bolt-on.
 */

import { LIGHTROOM_LIBRARY_DISPLAY_LABEL } from "@/lib/lightroom-display";

/** Longest suffix first so longer package types win over shorter overlaps. */
export const MACOS_PACKAGE_EXTENSION_KIND_ENTRIES: { suffix: string; kind: string }[] = [
  { suffix: ".photoslibrary", kind: "photoslibrary" },
  { suffix: ".imovieproject", kind: "imovieproject" },
  { suffix: ".lrlibrary", kind: "lrlibrary" },
  { suffix: ".playground", kind: "playground" },
  { suffix: ".fcpbundle", kind: "fcpbundle" },
  { suffix: ".dvdproj", kind: "dvdproj" },
  { suffix: ".logicx", kind: "logicx" },
  { suffix: ".band", kind: "band" },
];

export function getMacosPackageKindFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  for (const { suffix, kind } of MACOS_PACKAGE_EXTENSION_KIND_ENTRIES) {
    if (lower.endsWith(suffix)) return kind;
  }
  return null;
}

export function isMacosPackageFileName(fileName: string): boolean {
  return getMacosPackageKindFromFileName(fileName) != null;
}

/**
 * True when a relative path string includes a macOS package root segment followed by `/`
 * (e.g. `Photos/Catalog.lrlibrary/foo` or `Edit.fcpbundle/…`).
 * Used to prefer directory-entry drag/drop trees over a longer but flat `dataTransfer.files` list.
 */
export function pathLooksLikeInsideMacosPackage(relativePath: string): boolean {
  const p = relativePath.replace(/^\/+/, "").toLowerCase();
  return MACOS_PACKAGE_EXTENSION_KIND_ENTRIES.some(({ suffix }) => p.includes(`${suffix}/`));
}

/** True if any file uses `webkitRelativePath` or name that looks inside a macOS package tree. */
export function fileListHasMacosPackageInteriorPaths(files: File[]): boolean {
  return files.some((f) => {
    const wr = ((f as File & { webkitRelativePath?: string }).webkitRelativePath ?? "").trim();
    const key = wr.length > 0 ? wr : f.name;
    return pathLooksLikeInsideMacosPackage(key);
  });
}

export function packageKindDisplayLabel(kind: string): string {
  switch (kind) {
    case "fcpbundle":
      return "Final Cut Pro library";
    case "photoslibrary":
      return "Photos library";
    case "logicx":
      return "Logic Pro project";
    case "imovieproject":
      return "iMovie project";
    case "band":
      return "GarageBand project";
    case "dvdproj":
      return "iDVD project";
    case "playground":
      return "Swift Playground";
    case "lrlibrary":
      return LIGHTROOM_LIBRARY_DISPLAY_LABEL;
    default:
      return "macOS package";
  }
}

/**
 * Single-stream browser upload: no path inside the bundle (picker exposed one file/blob only).
 * We block most macOS packages so users use folder/drag for a full tree (see warning copy).
 *
 * **Exception: `.lrlibrary`** — Chromium/Safari often surface Lightroom Library as one `File` stream
 * (opaque package). Accepting it matches user expectation and still uploads usable library bytes;
 * users can still use Browse folders / drag for an explicit directory walk when the browser exposes it.
 */
export function isLikelyFlatMacosPackageBrowserUpload(file: File): boolean {
  if (!isMacosPackageFileName(file.name)) return false;
  if (file.name.toLowerCase().endsWith(".lrlibrary")) return false;
  const rel = (file.webkitRelativePath ?? "").trim();
  /** Folder / drag-tree uploads set paths like `MyLib.fcpbundle/Contents/Info.plist`. */
  if (rel.includes("/")) return false;
  return true;
}

/**
 * HTML `accept` hint for file inputs that should highlight macOS creative packages (optional).
 * Does not replace "all files" — use alongside `video/*` etc. if you add a restrictive accept string.
 */
export const UPPY_MACOS_CREATIVE_PACKAGE_ACCEPT_EXTENSIONS =
  ".fcpbundle,.lrlibrary,.photoslibrary,.logicx,.imovieproject,.band,.playground,.dvdproj";

export const MACOS_PACKAGE_STRUCTURED_UPLOAD_BLURB =
  "This project is a macOS package folder (Finder shows it as one item). To preserve the full library and internal file relationships, Bizzi Cloud uploads it as a structured package with paths — not as a single opaque file.";

export function flatMacosPackageUserMessage(fileName: string): string {
  const kind = getMacosPackageKindFromFileName(fileName) ?? "package";
  const label = packageKindDisplayLabel(kind);
  const lower = fileName.toLowerCase();
  const uploadNoun =
    lower.endsWith(".fcpbundle") || lower.endsWith(".lrlibrary") ? "library" : "package";
  return (
    `${fileName} is a ${label} — a folder-like package on macOS, not a normal file. ` +
    `Your browser only provided a single file stream, so we cannot guarantee the full internal structure. ` +
    `To back up the complete library for your creative app to open later, use one of these:\n\n` +
    `• Upload folder: choose the ${uploadNoun} folder via “Upload folder” (or drag the package onto the page so the browser exposes its contents).\n` +
    `• Or compress: right‑click the package in Finder → Compress, then upload the .zip.\n\n` +
    `We won’t treat a single-stream upload as full ${label} support.`
  );
}
