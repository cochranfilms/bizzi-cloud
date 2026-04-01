/**
 * Canonical Gallery Media relative_path rules + legacy read compatibility.
 * Writes use Favorited / Selected; reads accept Favorites / Selects and galleryId roots.
 * (Server-only allocation: see gallery-media-folder-admin.ts)
 */
import { slugify } from "@/lib/gallery-slug";

/** Canonical folder names (object storage / new proofing rows). */
export const CANONICAL_PHOTO_PROOFING_FOLDER = "Favorited";
export const CANONICAL_VIDEO_PROOFING_FOLDER = "Selected";

/** Legacy proofing folder names (reads only). */
export const LEGACY_PHOTO_PROOFING_FOLDER = "Favorites";
export const LEGACY_VIDEO_PROOFING_FOLDER = "Selects";

export type GalleryScopeForMediaFolder = {
  photographerId: string;
  organizationId: string | null;
  personalTeamOwnerId: string | null;
};

function normSeg(s: string): string {
  return s.trim().toLowerCase();
}

export function canonicalProofingRootSegment(galleryType: "photo" | "video"): string {
  return galleryType === "video" ? CANONICAL_VIDEO_PROOFING_FOLDER : CANONICAL_PHOTO_PROOFING_FOLDER;
}

/** Map a path segment to logical proofing kind, or null. */
export function normalizeProofingRootSegmentForRead(segment: string): "photo" | "video" | null {
  const n = normSeg(segment);
  if (n === normSeg(CANONICAL_PHOTO_PROOFING_FOLDER) || n === normSeg(LEGACY_PHOTO_PROOFING_FOLDER)) {
    return "photo";
  }
  if (n === normSeg(CANONICAL_VIDEO_PROOFING_FOLDER) || n === normSeg(LEGACY_VIDEO_PROOFING_FOLDER)) {
    return "video";
  }
  return null;
}

export function isAcceptedPhotoProofingSegment(segment: string): boolean {
  return normalizeProofingRootSegmentForRead(segment) === "photo";
}

export function isAcceptedVideoProofingSegment(segment: string): boolean {
  return normalizeProofingRootSegmentForRead(segment) === "video";
}

/**
 * Storage roots for a gallery: canonical media folder + legacy Firestore id (deduped).
 */
export function galleryStoragePathRoots(gallery: {
  id: string;
  media_folder_segment?: string | null;
}): string[] {
  const roots: string[] = [];
  const seg =
    typeof gallery.media_folder_segment === "string" && gallery.media_folder_segment.trim()
      ? gallery.media_folder_segment.trim()
      : null;
  if (seg) roots.push(seg);
  if (gallery.id && !roots.includes(gallery.id)) roots.push(gallery.id);
  return roots;
}

export function relativePathBelongsToGalleryRoots(relativePath: string, roots: string[]): boolean {
  const p = relativePath.replace(/^\/+/, "");
  for (const r of roots) {
    if (p === r || p.startsWith(`${r}/`)) return true;
  }
  return false;
}

/**
 * Single segment used in backup_files paths for this gallery (read side).
 * Prefer persisted media_folder_segment; fall back to slug(title); last resort gallery id.
 */
export function resolveMediaFolderSegmentForPath(
  galleryRow: { id?: string; title?: unknown; media_folder_segment?: unknown },
  galleryId: string
): string {
  const raw = galleryRow.media_folder_segment;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const t = typeof galleryRow.title === "string" ? galleryRow.title.trim() : "";
  if (t) {
    const s = slugify(t);
    if (s) return s;
  }
  return galleryId;
}

export function slugClientNameForFolder(clientName: string | null | undefined): string {
  const raw = typeof clientName === "string" ? clientName.trim() : "";
  if (!raw) return "client-unknown";
  const s = slugify(raw).slice(0, 80);
  return s || "client-unknown";
}

/** True if path is under any gallery root and second segment is a photo proofing folder (canonical or legacy). */
/** Subfolder inside a gallery folder where RAW video source files are archived after switching to Final Delivery. Not the account-level Creator RAW drive. */
export const GALLERY_RAW_ARCHIVE_FOLDER_SEGMENT = "RAW";

export function relativePathIsInPhotoProofingTree(
  relativePath: string,
  gallery: { id: string; media_folder_segment?: string | null }
): boolean {
  const roots = galleryStoragePathRoots(gallery);
  const p = relativePath.replace(/^\/+/, "");
  for (const root of roots) {
    const prefix = `${root}/`;
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    const seg = rest.split("/").filter(Boolean)[0] ?? "";
    if (isAcceptedPhotoProofingSegment(seg)) return true;
  }
  return false;
}

/** True if path is under any gallery root and second segment is a video proofing folder (canonical or legacy). */
export function relativePathIsInVideoProofingTree(
  relativePath: string,
  gallery: { id: string; media_folder_segment?: string | null }
): boolean {
  const roots = galleryStoragePathRoots(gallery);
  const p = relativePath.replace(/^\/+/, "");
  for (const root of roots) {
    const prefix = `${root}/`;
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    const seg = rest.split("/").filter(Boolean)[0] ?? "";
    if (isAcceptedVideoProofingSegment(seg)) return true;
  }
  return false;
}

/**
 * True if file already lives under this gallery's archival RAW subfolder (`{root}/RAW/...`).
 * Uses exact segment "RAW" per product spec.
 */
export function relativePathIsInGalleryRawArchiveSubfolder(
  relativePath: string,
  gallery: { id: string; media_folder_segment?: string | null }
): boolean {
  const roots = galleryStoragePathRoots(gallery);
  const p = relativePath.replace(/^\/+/, "");
  for (const root of roots) {
    const exact = `${root}/${GALLERY_RAW_ARCHIVE_FOLDER_SEGMENT}`;
    if (p === exact || p.startsWith(`${exact}/`)) return true;
  }
  return false;
}

/**
 * If this file should be archived into `{galleryRoot}/RAW/...`, returns the new relative_path; otherwise null.
 * Skips proofing trees, linked-only paths, and paths already under the gallery RAW archive folder.
 */
export function resolveGalleryRawVideoArchiveDestinationRelativePath(
  relativePath: string,
  gallery: { id: string; media_folder_segment?: string | null }
): string | null {
  const p = relativePath.replace(/^\/+/, "");
  const roots = galleryStoragePathRoots(gallery);
  for (const root of roots) {
    const prefix = `${root}/`;
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (!rest) return null;
    if (
      rest === GALLERY_RAW_ARCHIVE_FOLDER_SEGMENT ||
      rest.startsWith(`${GALLERY_RAW_ARCHIVE_FOLDER_SEGMENT}/`)
    ) {
      return null;
    }
    const seg0 = rest.split("/").filter(Boolean)[0] ?? "";
    if (isAcceptedVideoProofingSegment(seg0)) return null;
    return `${root}/${GALLERY_RAW_ARCHIVE_FOLDER_SEGMENT}/${rest}`;
  }
  return null;
}

export function buildMaterializedListPrefix(params: {
  mediaFolderSegment: string;
  galleryKind: "photo" | "video";
  clientFolderSegment: string;
}): string {
  const root = canonicalProofingRootSegment(params.galleryKind);
  return `${params.mediaFolderSegment}/${root}/${params.clientFolderSegment}`;
}

export function buildMergeRelativePrefix(params: {
  mediaFolderSegment: string;
  galleryKind: "photo" | "video";
  mergeSlug: string;
  mergedSegment: string;
}): string {
  const root = canonicalProofingRootSegment(params.galleryKind);
  return `${params.mediaFolderSegment}/${root}/${params.mergedSegment}/${params.mergeSlug}`;
}

/** Maps first path segment (media_folder_segment or legacy gallery id) → canonical galleries doc id. */
export function buildGalleryMediaPathSegmentIndex(
  galleries: ReadonlyArray<{ id: string; media_folder_segment?: string | null }>
): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of galleries) {
    m.set(g.id, g.id);
    const seg = typeof g.media_folder_segment === "string" ? g.media_folder_segment.trim() : "";
    if (seg) m.set(seg, g.id);
  }
  return m;
}

/**
 * One logical gallery folder in UI: merge rows that use Firestore gallery_id with rows that only have
 * media_folder_segment as the first path segment (avoids duplicate tiles after materialize / mixed writes).
 */
export function canonicalGalleryIdForGalleryMediaPath(
  relativePath: string,
  galleryIdOnFile: string | null | undefined,
  pathTopToGalleryId: Map<string, string>
): string {
  if (galleryIdOnFile) return galleryIdOnFile;
  const seg0 = relativePath.split("/").filter(Boolean)[0] ?? "";
  return pathTopToGalleryId.get(seg0) ?? seg0;
}

/** Object storage path root under Gallery Media drive for a gallery (segment, or id for legacy paths). */
export function galleryMediaStorageRootForCanonicalId(
  canonicalId: string,
  galleries: ReadonlyArray<{ id: string; media_folder_segment?: string | null }>
): string {
  const g = galleries.find((x) => x.id === canonicalId);
  const seg = typeof g?.media_folder_segment === "string" ? g.media_folder_segment.trim() : "";
  if (seg) return seg;
  return canonicalId;
}

export function formatGalleryMediaFolderBreadcrumb(
  currentDrivePath: string,
  galleries: ReadonlyArray<{ id: string; title: string; media_folder_segment?: string | null }>
): string {
  const trimmed = currentDrivePath.replace(/^\/+/, "");
  if (!trimmed) return "";
  const segments = trimmed.split("/").filter(Boolean);
  const firstSeg = segments[0] ?? "";
  const rest = segments.slice(1);
  const g = galleries.find(
    (x) =>
      x.id === firstSeg ||
      (typeof x.media_folder_segment === "string" && x.media_folder_segment === firstSeg)
  );
  const head = g?.title ?? firstSeg;
  return rest.length > 0 ? `${head}/${rest.join("/")}` : head;
}
