/**
 * Server-only: Firestore + Node crypto for gallery media folder allocation.
 */
import { createHash } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { slugify } from "@/lib/gallery-slug";
import type { ProofingListType } from "@/lib/gallery-proofing-types";
import type { GalleryScopeForMediaFolder } from "@/lib/gallery-media-path";
import { slugClientNameForFolder } from "@/lib/gallery-media-path";

/** First 4 hex chars of SHA-256(listDocId) — stable for a given list id. */
export function shortStableIdFromListDocId(listDocId: string): string {
  return createHash("sha256").update(listDocId, "utf8").digest("hex").slice(0, 4);
}

/**
 * Allocates client_folder_segment: slug(client_name) or client-unknown; on collision suffix -abcd.
 */
export async function allocateClientFolderSegment(
  db: Firestore,
  galleryId: string,
  newListDocId: string,
  listType: ProofingListType,
  clientName: string | null | undefined
): Promise<string> {
  const base = slugClientNameForFolder(clientName);
  const snap = await db
    .collection("favorites_lists")
    .where("gallery_id", "==", galleryId)
    .where("list_type", "==", listType)
    .get();

  const used = new Set<string>();
  for (const d of snap.docs) {
    if (d.id === newListDocId) continue;
    const cf = d.data().client_folder_segment as string | undefined;
    if (cf) used.add(cf);
  }

  if (!used.has(base)) return base;
  let candidate = `${base}-${shortStableIdFromListDocId(newListDocId)}`;
  let n = 0;
  while (used.has(candidate)) {
    n++;
    candidate = `${base}-${shortStableIdFromListDocId(`${newListDocId}:${n}`)}`;
  }
  return candidate;
}

function galleriesScopeQuery(db: Firestore, scope: GalleryScopeForMediaFolder) {
  let q = db.collection("galleries").where("photographer_id", "==", scope.photographerId);
  const oid =
    scope.organizationId != null && scope.organizationId !== "" ? scope.organizationId : null;
  const pto =
    scope.personalTeamOwnerId != null && scope.personalTeamOwnerId !== ""
      ? scope.personalTeamOwnerId
      : null;
  q = q.where("organization_id", "==", oid);
  q = q.where("personal_team_owner_id", "==", pto);
  return q;
}

/**
 * Unique media_folder_segment within the same Gallery Media scope (drive boundary).
 */
export async function ensureUniqueMediaFolderSegment(
  db: Firestore,
  scope: GalleryScopeForMediaFolder,
  title: string,
  excludeGalleryId?: string
): Promise<string> {
  let base = slugify(title.trim());
  if (!base) base = "gallery";
  let candidate = base;
  let attempt = 0;
  while (true) {
    const snap = await galleriesScopeQuery(db, scope)
      .where("media_folder_segment", "==", candidate)
      .limit(5)
      .get();
    const conflict = snap.docs.find((d) => d.id !== excludeGalleryId);
    if (!conflict) return candidate;
    attempt++;
    candidate = `${base}-${attempt}`;
  }
}
