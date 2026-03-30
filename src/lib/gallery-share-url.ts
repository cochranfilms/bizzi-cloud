/**
 * Preferred public gallery URLs for creators and invite emails.
 * Pure functions — no I/O. Callers supply slug/handle from Firestore.
 */

export interface PreferredGallerySharePathParams {
  publicSlug: string | null | undefined;
  gallerySlug: string | null | undefined;
  galleryId: string;
}

function norm(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

/**
 * Branded path only when both handle and gallery slug are non-empty after trim.
 * Otherwise `/g/{galleryId}`.
 */
export function getPreferredGallerySharePath(
  params: PreferredGallerySharePathParams
): string {
  const handle = norm(params.publicSlug);
  const slug = norm(params.gallerySlug);
  const id = typeof params.galleryId === "string" ? params.galleryId.trim() : "";
  if (!id) return "/g/";
  if (handle && slug) {
    return `/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
  }
  return `/g/${id}`;
}

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

/** Absolute URL for emails and server responses. */
export function getPreferredGalleryShareAbsoluteUrl(
  baseUrl: string,
  params: PreferredGallerySharePathParams
): string {
  const base = stripTrailingSlash(typeof baseUrl === "string" ? baseUrl.trim() : "");
  const path = getPreferredGallerySharePath(params);
  return `${base}${path}`;
}

/**
 * Creator-facing UI: same path rules, current or configured app origin.
 */
export function getDisplayGalleryShareUrl(args: {
  origin: string;
  publicSlug: string | null | undefined;
  gallerySlug: string | null | undefined;
  galleryId: string;
}): string {
  return getPreferredGalleryShareAbsoluteUrl(args.origin, {
    publicSlug: args.publicSlug,
    gallerySlug: args.gallerySlug,
    galleryId: args.galleryId,
  });
}
