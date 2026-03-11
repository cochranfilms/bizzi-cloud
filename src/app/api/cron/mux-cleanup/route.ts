/**
 * Cron: Delete Mux assets after retention period. Use Mux only as a temporary proxy.
 * After deletion, previews fall back to B2/ffmpeg proxy. Originals stay in B2.
 *
 * Schedule: daily (e.g. 3am). Requires CRON_SECRET.
 * Env: MUX_RETENTION_DAYS (default 7) — how long to keep Mux assets before deleting.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { deleteMuxAsset, isMuxConfigured } from "@/lib/mux";
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const RETENTION_DAYS = parseInt(process.env.MUX_RETENTION_DAYS ?? "7", 10) || 7;

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isMuxConfigured()) {
    return NextResponse.json({ deleted: 0, skipped: true, reason: "Mux not configured" });
  }

  const db = getAdminFirestore();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const snap = await db
    .collection("backup_files")
    .where("mux_asset_id", ">", "")
    .limit(100)
    .get();

  let deleted = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const assetId = data.mux_asset_id as string | undefined;
    const createdAt = data.mux_created_at as string | undefined;

    if (!assetId) continue;

    const shouldDelete = !createdAt || new Date(createdAt) < cutoff;
    if (!shouldDelete) continue;

    try {
      const ok = await deleteMuxAsset(assetId);
      if (ok) {
        await doc.ref.update({
          mux_asset_id: null,
          mux_playback_id: null,
          mux_status: null,
          mux_created_at: null,
          mux_deleted_at: new Date().toISOString(),
        });
        deleted++;
      }
    } catch (err) {
      console.error("[mux-cleanup] Failed to delete asset:", assetId, err);
    }
  }

  return NextResponse.json({ deleted, retentionDays: RETENTION_DAYS });
}
