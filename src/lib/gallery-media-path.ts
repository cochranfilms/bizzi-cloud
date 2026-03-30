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
