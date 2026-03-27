import { getDownloadUrl } from "@/lib/cdn";
import { isB2Configured } from "@/lib/b2";
import { verifyBackupFileAccessWithLifecycle } from "@/lib/backup-access";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

async function getFileIdForObject(db: Firestore, uid: string, objectKey: string): Promise<string | null> {
  const snap = await db
    .collection("backup_files")
    .where("userId", "==", uid)
    .where("object_key", "==", objectKey)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  if (!isBackupFileActiveForListing(data as Record<string, unknown>)) return null;
  return snap.docs[0].id;
}

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const {
    file_id: fileId,
    object_key: objectKey,
    device_id: deviceId,
    relative_path,
    size_bytes,
    user_id: userIdFromBody,
  } = body;

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && userIdFromBody) {
    uid = userIdFromBody;
  } else if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
  }

  const objKey = objectKey ?? null;
  const relPath = relative_path ?? "";
  const size = typeof size_bytes === "number" ? size_bytes : 0;

  if (!deviceId || typeof deviceId !== "string") {
    return NextResponse.json(
      { error: "device_id is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  let resolvedFileId = typeof fileId === "string" ? fileId : null;
  let resolvedObjectKey = typeof objKey === "string" ? objKey : null;
  if (resolvedObjectKey && !resolvedFileId) {
    resolvedFileId = await getFileIdForObject(db, uid, resolvedObjectKey);
  }
  if (resolvedFileId && !resolvedObjectKey) {
    resolvedObjectKey = await getObjectKeyForFile(db, resolvedFileId);
  }

  if (!resolvedObjectKey || !resolvedFileId) {
    return NextResponse.json(
      { error: "file_id or object_key required" },
      { status: 400 }
    );
  }

  const result = await verifyBackupFileAccessWithLifecycle(uid, resolvedObjectKey);
  if (!result.allowed) {
    return NextResponse.json(
      { error: result.message ?? "Access denied" },
      { status: result.status ?? 403 }
    );
  }

  const existing = await db
    .collection("local_store_entries")
    .where("user_id", "==", uid)
    .where("device_id", "==", deviceId)
    .where("file_id", "==", resolvedFileId)
    .limit(1)
    .get();

  const now = new Date().toISOString();
  const entry = {
    user_id: uid,
    device_id: deviceId,
    file_id: resolvedFileId,
    object_key: resolvedObjectKey,
    relative_path: relPath,
    local_path: "", // filled by desktop
    store_status: "pending" as const,
    store_progress: 0,
    total_bytes: size,
    downloaded_bytes: 0,
    checksum: null,
    created_at: now,
    updated_at: now,
    last_verified_at: null,
    offline_available: false,
    stale: false,
  };

  let entryId: string;
  if (!existing.empty) {
    const doc = existing.docs[0];
    entryId = doc.id;
    if (doc.data().store_status === "completed") {
      const url = await getDownloadUrl(resolvedObjectKey, 7200);
      return NextResponse.json({
        entry_id: doc.id,
        status: "completed",
        message: "Already stored locally",
        url,
        object_key: resolvedObjectKey,
        file_id: resolvedFileId,
        total_bytes: size,
      });
    }
    await db.collection("local_store_entries").doc(doc.id).update({
      ...entry,
      updated_at: now,
    });
  } else {
    const ref = await db.collection("local_store_entries").add(entry);
    entryId = ref.id;
  }

  const url = await getDownloadUrl(resolvedObjectKey, 7200);

  return NextResponse.json({
    entry_id: entryId,
    url,
    object_key: resolvedObjectKey,
    file_id: resolvedFileId,
    total_bytes: size,
  });
}

async function getObjectKeyForFile(
  db: Firestore,
  fileId: string
): Promise<string | null> {
  const doc = await db.collection("backup_files").doc(fileId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data || !isBackupFileActiveForListing(data as Record<string, unknown>)) return null;
  return data?.object_key ?? null;
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entry_id");
  const fileId = url.searchParams.get("file_id");
  const deviceId = url.searchParams.get("device_id");

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && url.searchParams.get("user_id")) {
    uid = url.searchParams.get("user_id")!;
  } else if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
  }

  if (!deviceId) {
    return NextResponse.json(
      { error: "device_id query parameter required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  if (entryId) {
    const doc = await db.collection("local_store_entries").doc(entryId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    const data = doc.data()!;
    if (data.user_id !== uid || data.device_id !== deviceId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    await db.collection("local_store_entries").doc(entryId).delete();
    return NextResponse.json({ removed: true });
  }

  if (fileId) {
    const snap = await db
      .collection("local_store_entries")
      .where("user_id", "==", uid)
      .where("device_id", "==", deviceId)
      .where("file_id", "==", fileId)
      .limit(1)
      .get();
    if (snap.empty) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    await db.collection("local_store_entries").doc(snap.docs[0].id).delete();
    return NextResponse.json({ removed: true });
  }

  return NextResponse.json(
    { error: "entry_id or file_id required" },
    { status: 400 }
  );
}
