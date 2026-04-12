/**
 * Proofing list types — neutral internal naming.
 * User-facing: "Favorites" (photo) / "Selects" (video). Firestore collection: favorites_lists.
 *
 * Invariant: business `status` does not encode materialization progress; use `materialization_state`
 * and count fields for technical truth.
 */

export type ProofingListBusinessStatus = "submitted" | "archived";

/** Technical materialization lifecycle — see plan for partial vs failed definitions. */
export type MaterializationState = "idle" | "processing" | "complete" | "partial" | "failed";

export type ProofingListType = "photo_favorites" | "video_selects";

export type ShellContext = "personal" | "enterprise" | "personal_team";

export type SubmissionSource = "public_gallery" | "dashboard_proofing" | "enterprise_proofing";

export type CreatedByRole = "client" | "photographer";

import {
  CANONICAL_PHOTO_PROOFING_FOLDER,
  CANONICAL_VIDEO_PROOFING_FOLDER,
  canonicalProofingRootSegment,
} from "@/lib/gallery-media-path";

/** Canonical storage segment for photo proofing (writes). Legacy reads use "Favorites". */
export const PROOFING_ROOT_FAVORITES = CANONICAL_PHOTO_PROOFING_FOLDER;
/** Canonical storage segment for video proofing (writes). Legacy reads use "Selects". */
export const PROOFING_ROOT_SELECTS = CANONICAL_VIDEO_PROOFING_FOLDER;

export type ProofingRootSegment = typeof PROOFING_ROOT_FAVORITES | typeof PROOFING_ROOT_SELECTS;

export function proofingRootSegmentFromGalleryType(
  galleryType: "photo" | "video" | "mixed" | undefined | null
): ProofingRootSegment {
  const k = galleryType === "video" ? "video" : "photo";
  return canonicalProofingRootSegment(k) as ProofingRootSegment;
}

/** Proofing storage root follows list type (required for mixed galleries). */
export function proofingRootSegmentFromListType(listType: ProofingListType): ProofingRootSegment {
  const k = listType === "video_selects" ? "video" : "photo";
  return canonicalProofingRootSegment(k) as ProofingRootSegment;
}

/** Merge folders live under `_merged/{merge_slug}/` — new slug per merge action. */
export const PROOFING_MERGED_SEGMENT = "_merged";

export function parseShellContextHeader(header: string | null): ShellContext {
  const v = header?.trim().toLowerCase();
  if (v === "enterprise") return "enterprise";
  if (v === "personal_team") return "personal_team";
  return "personal";
}

/** Client-side: derive the same shell enum to send as `X-Bizzi-Shell` from the dashboard route. */
export function shellContextFromClientPathname(pathname: string | null | undefined): ShellContext {
  if (!pathname) return "personal";
  if (pathname.startsWith("/enterprise")) return "enterprise";
  if (pathname.startsWith("/team/")) return "personal_team";
  return "personal";
}

/** Home hub href (merged files area) aligned with dashboard / enterprise / team / desktop gallery detail URLs. */
export function proofingFilesHrefFromGalleryDetailHref(galleryDetailHref: string): string {
  return galleryDetailHref.replace(/\/galleries\/[^/]+$/, "");
}

/** Public share route uses /g/{id}/selects/... vs /g/{id}/favorites/... — keep detection centralized for copy. */
export function isSelectsPublicSharePathname(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && pathname.includes("/selects/");
}

export function parseSubmissionSourceHeader(header: string | null): SubmissionSource | null {
  const v = header?.trim().toLowerCase();
  if (v === "dashboard_proofing") return "dashboard_proofing";
  if (v === "enterprise_proofing") return "enterprise_proofing";
  if (v === "public_gallery") return "public_gallery";
  return null;
}
