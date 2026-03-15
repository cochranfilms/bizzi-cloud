import type { Firestore, Transaction } from "firebase-admin/firestore";

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

    const conflict = snap.docs.find((d) => d.id !== excludeId) ?? null;
    if (!conflict) return slug;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }
}

/**
 * Same as ensureUniqueSlug but uses transaction for reads.
 * Use inside db.runTransaction() so slug check participates in optimistic concurrency.
 */
export async function ensureUniqueSlugInTransaction(
  tx: Transaction,
  db: Firestore,
  photographerId: string,
  baseSlug: string,
  excludeId?: string
): Promise<string> {
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const query = db
      .collection("galleries")
      .where("photographer_id", "==", photographerId)
      .where("slug", "==", slug)
      .limit(1);
    const snap = await tx.get(query);
    const conflict = snap.docs.find((d) => (d as { id: string }).id !== excludeId);
    if (!conflict) return slug;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }
}
