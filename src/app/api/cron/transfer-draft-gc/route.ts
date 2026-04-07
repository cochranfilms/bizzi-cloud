/**
 * Cron: Delete stale unpublished transfers (lifecycle draft, no recipient access).
 * Schedule periodically (e.g. daily). Requires CRON_SECRET when set.
 *
 * Env: TRANSFER_DRAFT_GC_DAYS (default 7) — delete drafts older than this many days.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_LIMIT = 40;
const ITEM_DELETE_CHUNK = 450;

async function deleteDraftTransferDocs(
  db: Firestore,
  slug: string
): Promise<{ itemsDeleted: number }> {
  const ref = db.collection("transfers").doc(slug);
  let itemsDeleted = 0;
  for (let round = 0; round < 500; round++) {
    const snap = await ref.collection("items").limit(ITEM_DELETE_CHUNK).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
      itemsDeleted += 1;
    }
    await batch.commit();
  }
  await ref.delete();
  return { itemsDeleted };
}

async function handleCron(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const ttlDays = Math.max(
    1,
    Number.parseInt(process.env.TRANSFER_DRAFT_GC_DAYS ?? "7", 10) || 7
  );
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ttlDays);
  const cutoffIso = cutoff.toISOString();

  const db = getAdminFirestore();
  const snap = await db
    .collection("transfers")
    .where("transfer_lifecycle", "in", ["draft", "uploading"])
    .where("created_at", "<", cutoffIso)
    .limit(BATCH_LIMIT)
    .get();

  if (snap.empty) {
    return NextResponse.json({ ok: true, deleted: 0, items_deleted: 0 });
  }

  let transfersDeleted = 0;
  let itemsDeleted = 0;
  for (const docSnap of snap.docs) {
    try {
      const { itemsDeleted: n } = await deleteDraftTransferDocs(db, docSnap.id);
      itemsDeleted += n;
      transfersDeleted += 1;
    } catch (err) {
      console.error("[transfer-draft-gc]", docSnap.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    deleted: transfersDeleted,
    items_deleted: itemsDeleted,
    cutoff_iso: cutoffIso,
  });
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
