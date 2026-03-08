/**
 * Per-client download tracking for gallery free_download_limit.
 * Uses IP + User-Agent hash as client identifier (best-effort, no auth required).
 */
import { createHash } from "crypto";
import type { Firestore } from "firebase-admin/firestore";

export function getGalleryDownloadClientId(request: Request): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "0";
  const ua = request.headers.get("user-agent") || "";
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32);
}

export async function checkAndIncrementDownloadCount(
  db: Firestore,
  galleryId: string,
  clientId: string,
  limit: number
): Promise<{ allowed: boolean; used: number; remaining: number }> {
  const docId = `${galleryId}_${clientId}`;
  const ref = db.collection("gallery_download_counts").doc(docId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data()?.count as number) ?? 0 : 0;

    if (current >= limit) {
      return { allowed: false, used: current, remaining: 0 };
    }

    tx.set(ref, {
      count: current + 1,
      updated_at: new Date(),
    });

    return { allowed: true, used: current + 1, remaining: limit - current - 1 };
  });

  return result;
}

export async function getDownloadCount(
  db: Firestore,
  galleryId: string,
  clientId: string
): Promise<number> {
  const docId = `${galleryId}_${clientId}`;
  const snap = await db.collection("gallery_download_counts").doc(docId).get();
  return snap.exists ? (snap.data()?.count as number) ?? 0 : 0;
}
