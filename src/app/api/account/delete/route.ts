/**
 * POST /api/account/delete
 * Full account deletion (GDPR Article 17). Requires confirmation in body.
 * Body: { confirmation: "DELETE" } or { password: "..." }
 */
import { getAdminFirestore, getAdminAuth, verifyIdToken } from "@/lib/firebase-admin";
import {
  isB2Configured,
  deleteObject,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, getClientIp } from "@/lib/audit-log";
import { NextResponse } from "next/server";

const BATCH_SIZE = 500;

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const rl = checkRateLimit(`delete:${uid}`, 3, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { confirmation?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.confirmation !== "DELETE") {
    return NextResponse.json(
      { error: 'Confirmation required. Send { "confirmation": "DELETE" } to proceed.' },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const auth = getAdminAuth();

  // 1. Get all backup_files for user (to delete B2 objects)
  const filesSnap = await db.collection("backup_files").where("userId", "==", uid).get();
  const filesToDelete = filesSnap.docs.map((d) => ({
    id: d.id,
    object_key: (d.data()?.object_key as string) ?? "",
  }));

  // 2. Delete B2 objects (only if no other backup_file references)
  if (isB2Configured()) {
    for (const { id, object_key } of filesToDelete) {
      if (!object_key) continue;
      const refsSnap = await db.collection("backup_files").where("object_key", "==", object_key).get();
      const otherRefs = refsSnap.docs.filter((d) => d.id !== id);
      if (otherRefs.length > 0) continue;
      try {
        await deleteObject(object_key);
        await deleteObject(getProxyObjectKey(object_key)).catch(() => {});
        await deleteObject(getVideoThumbnailCacheKey(object_key)).catch(() => {});
      } catch (err) {
        console.error("[account-delete] B2 delete failed:", object_key, err);
      }
    }
  }

  // 3. Get gallery IDs for this user
  const galleriesSnap = await db.collection("galleries").where("photographer_id", "==", uid).get();
  const galleryIds = galleriesSnap.docs.map((d) => d.id);

  // 4. Delete gallery_assets for user's galleries
  for (let i = 0; i < galleryIds.length; i += 10) {
    const batch = galleryIds.slice(i, i + 10);
    const assetsSnap = await db.collection("gallery_assets").where("gallery_id", "in", batch).get();
    for (let j = 0; j < assetsSnap.docs.length; j += BATCH_SIZE) {
      const chunk = assetsSnap.docs.slice(j, j + BATCH_SIZE);
      const batchWrite = db.batch();
      chunk.forEach((d) => batchWrite.delete(d.ref));
      await batchWrite.commit();
    }
  }

  // 5. Delete favorites_lists for user's galleries
  for (const gid of galleryIds) {
    const listsSnap = await db.collection("favorites_lists").where("gallery_id", "==", gid).get();
    for (let j = 0; j < listsSnap.docs.length; j += BATCH_SIZE) {
      const chunk = listsSnap.docs.slice(j, j + BATCH_SIZE);
      const batchWrite = db.batch();
      chunk.forEach((d) => batchWrite.delete(d.ref));
      await batchWrite.commit();
    }
  }

  // 6. Collections to delete by query
  const deleteByQuery = async (
    collection: string,
    field: string,
    value: string
  ) => {
    let done = false;
    while (!done) {
      const snap = await db.collection(collection).where(field, "==", value).limit(BATCH_SIZE).get();
      if (snap.empty) {
        done = true;
        break;
      }
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  };

  await deleteByQuery("backup_files", "userId", uid);
  await deleteByQuery("backup_snapshots", "userId", uid);
  await deleteByQuery("pinned_items", "userId", uid);
  await deleteByQuery("local_store_entries", "user_id", uid);
  await deleteByQuery("devices", "user_id", uid);
  await deleteByQuery("notifications", "recipientUserId", uid);

  // linked_drives
  const drivesSnap = await db.collection("linked_drives").where("userId", "==", uid).get();
  for (const d of drivesSnap.docs) {
    await d.ref.delete();
  }

  // Also user_id for linked_drives (legacy)
  const drivesSnapLegacy = await db.collection("linked_drives").where("user_id", "==", uid).get();
  for (const d of drivesSnapLegacy.docs) {
    await d.ref.delete();
  }

  // folder_shares
  await deleteByQuery("folder_shares", "owner_id", uid);

  // transfers
  const transfersSnap = await db.collection("transfers").where("user_id", "==", uid).get();
  for (const d of transfersSnap.docs) {
    await d.ref.delete();
  }

  // galleries
  for (const d of galleriesSnap.docs) {
    await d.ref.delete();
  }

  // organization_seats - remove user from orgs
  await deleteByQuery("organization_seats", "user_id", uid);

  // profile
  await db.collection("profiles").doc(uid).delete();

  // Firebase Auth user
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    console.error("[account-delete] Firebase Auth delete failed:", err);
    // Continue - data is already deleted
  }

  await writeAuditLog({
    action: "account_delete",
    uid,
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ ok: true, message: "Account deleted successfully." });
}
