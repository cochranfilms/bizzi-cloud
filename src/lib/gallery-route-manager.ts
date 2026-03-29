/**
 * Whether the request's Bearer token identifies a user who can manage the gallery
 * (creator, team owner, or personal-team seat). Used by public-leaning GET routes
 * to distinguish managers from viewers.
 */
import type { DocumentData } from "firebase-admin/firestore";
import { verifyIdToken } from "@/lib/firebase-admin";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";

export async function requesterManagesGallery(
  request: Request,
  galleryRow: DocumentData
): Promise<boolean> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const decoded = await verifyIdToken(authHeader.slice(7).trim());
    return userCanManageGalleryAsPhotographer(decoded.uid, galleryRow);
  } catch {
    return false;
  }
}
