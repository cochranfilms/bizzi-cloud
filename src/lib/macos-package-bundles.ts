/**
 * macOS "packages" — directories Finder shows as single files (.fcpbundle, .photoslibrary, etc.).
 *
 * This is the client side of a **storage + upload workflow** for package-based creative containers
 * (`macos_package_*` fields on backup_files, structured relative_path trees, recursive drag/drop).
 * It is not an extension allowlist bolt-on.
 */

/** Longest suffix first so `.fcpbundle` wins over hypothetical shorter overlaps. */
export const MACOS_PACKAGE_EXTENSION_KIND_ENTRIES: { suffix: string; kind: string }[] = [
  { suffix: ".photoslibrary", kind: "photoslibrary" },
  { suffix: ".fcpbundle", kind: "fcpbundle" },
  { suffix: ".imovieproject", kind: "imovieproject" },
  { suffix: ".logicx", kind: "logicx" },
  { suffix: ".dvdproj", kind: "dvdproj" },
  { suffix: ".band", kind: "band" },
  { suffix: ".playground", kind: "playground" },
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
    default:
      return "macOS package";
  }
}

/**
 * Single-stream browser upload: no path inside the bundle (picker exposed one file/blob only).
 * Do not treat as full library backup.
 */
export function isLikelyFlatMacosPackageBrowserUpload(file: File): boolean {
  if (!isMacosPackageFileName(file.name)) return false;
  const rel = (file.webkitRelativePath ?? "").trim();
  /** Folder / drag-tree uploads set paths like `MyLib.fcpbundle/Contents/Info.plist`. */
  if (rel.includes("/")) return false;
  return true;
}

export const MACOS_PACKAGE_STRUCTURED_UPLOAD_BLURB =
  "This project is a macOS package folder (Finder shows it as one item). To preserve the full library and internal file relationships, Bizzi Cloud uploads it as a structured package with paths — not as a single opaque file.";

export function flatMacosPackageUserMessage(fileName: string): string {
  const kind = getMacosPackageKindFromFileName(fileName) ?? "package";
  const label = packageKindDisplayLabel(kind);
  return (
    `${fileName} is a ${label} — a folder-like package on macOS, not a normal file. ` +
    `Your browser only provided a single file stream, so we cannot guarantee the full internal structure. ` +
    `To back up the complete library for Final Cut Pro (or other apps) to open later, use one of these:\n\n` +
    `• Upload folder: choose the ${fileName.endsWith(".fcpbundle") ? "library" : "package"} folder via “Upload folder” (or drag the package onto the page so the browser exposes its contents).\n` +
    `• Or compress: right‑click the package in Finder → Compress, then upload the .zip.\n\n` +
    `We won’t treat a single-stream upload as full ${label} support.`
  );
}
