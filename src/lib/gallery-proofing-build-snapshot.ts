import type { Firestore } from "firebase-admin/firestore";
import type { AssetSnapshotMinEntry } from "@/lib/gallery-proofing-list-document";

export async function buildAssetSnapshotMin(
  db: Firestore,
  galleryId: string,
  assetIds: string[]
): Promise<AssetSnapshotMinEntry[]> {
  const out: AssetSnapshotMinEntry[] = [];
  for (const id of assetIds) {
    const snap = await db.collection("gallery_assets").doc(id).get();
    if (!snap.exists) continue;
    const d = snap.data()!;
    if (d.gallery_id !== galleryId) continue;
    const mt = d.media_type as string | undefined;
    const filename = (d.name as string) ?? "";
    const object_key = d.object_key as string | undefined;
    if (mt !== "image" && mt !== "video") continue;
    out.push({
      asset_id: id,
      filename,
      media_type: mt,
      ...(object_key ? { object_key } : {}),
    });
  }
  return out;
}
