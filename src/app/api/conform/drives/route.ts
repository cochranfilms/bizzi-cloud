/**
 * GET /api/conform/drives
 * List user's drives for conform scope selection.
 * Returns drive id and display name for mount/Storage/RAW/Gallery Media.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const addonIds: string[] = profileSnap.exists
    ? (profileSnap.data()?.addon_ids ?? [])
    : [];
  const hasEditor = addonIds.includes("editor") || addonIds.includes("fullframe");
  const hasGallerySuite = addonIds.includes("gallery") || addonIds.includes("fullframe");

  const [byUserId, byUserIdSnake] = await Promise.all([
    db.collection("linked_drives").where("userId", "==", uid).get(),
    db.collection("linked_drives").where("user_id", "==", uid).get(),
  ]);

  const seen = new Set<string>();
  /** Deduplicate by display name: one entry per name (e.g. single "Storage") */
  const byName = new Map<string, string>();

  for (const snap of [byUserId, byUserIdSnake]) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const data = d.data();
      if (data.deleted_at) continue;

      const isCreatorRaw = data.is_creator_raw === true;
      const rawName = data.name ?? "Drive";

      let displayName: string | null = null;
      if (rawName === "Storage" || rawName === "Uploads") {
        displayName = "Storage";
      } else if (isCreatorRaw && hasEditor) {
        displayName = "RAW";
      } else if (rawName === "Gallery Media" && hasGallerySuite) {
        displayName = "Gallery Media";
      } else if (!["Storage", "RAW", "Gallery Media"].includes(rawName)) {
        displayName = rawName;
      }
      if (displayName && !byName.has(displayName)) {
        byName.set(displayName, d.id);
      }
    }
  }

  const drives: Array<{ id: string; name: string }> = Array.from(byName.entries()).map(
    ([name, id]) => ({ id, name })
  );
  const order = (name: string) =>
    name === "Storage" ? 0 : name === "RAW" ? 1 : name === "Gallery Media" ? 2 : 3;
  drives.sort((a, b) => order(a.name) - order(b.name));

  return NextResponse.json({ drives });
}
