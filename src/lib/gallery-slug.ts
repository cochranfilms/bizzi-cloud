import type { Firestore } from "firebase-admin/firestore";

/**
 * Generate URL-safe slugs for galleries.
 * Must be unique per photographer.
 */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "gallery";
}

/** Ensure slug is unique for this photographer. Append number if needed. */
export async function ensureUniqueSlug(
  db: Firestore,
  photographerId: string,
  baseSlug: string,
  excludeId?: string
): Promise<string> {
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const snap = await db
      .collection("galleries")
      .where("photographer_id", "==", photographerId)
      .where("slug", "==", slug)
      .limit(1)
      .get();

    const conflict = snap.docs.find((d) => d.id !== excludeId);
    if (!conflict) return slug;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }
}
