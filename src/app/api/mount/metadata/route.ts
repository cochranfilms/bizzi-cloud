import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export interface MountMetadataEntry {
  id: string;
  name: string;
  path: string;
  object_key: string;
  size_bytes: number;
  modified_at: string | null;
  type: "file" | "folder";
  linked_drive_id: string;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { paths, drive_id: driveId, user_id: userIdFromBody } = body;

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

  const pathsArray = Array.isArray(paths) ? paths : [];
  let driveIdStr = typeof driveId === "string" ? driveId : null;

  const db = getAdminFirestore();

  // Resolve slug (Storage, RAW, Gallery Media) to actual drive ID
  if (driveIdStr && ["Storage", "RAW", "Gallery Media"].includes(driveIdStr)) {
    const [byUserId, byUserIdSnake] = await Promise.all([
      db.collection("linked_drives").where("userId", "==", uid).get(),
      db.collection("linked_drives").where("user_id", "==", uid).get(),
    ]);
    const slugToId = new Map<string, string>();
    for (const snap of [byUserId, byUserIdSnake]) {
      for (const d of snap.docs) {
        if (d.data().deleted_at) continue;
        const name = d.data().name ?? "Drive";
        const isCreatorRaw = d.data().is_creator_raw === true;
        if (name === "Storage" || name === "Uploads") slugToId.set("Storage", d.id);
        else if (isCreatorRaw) slugToId.set("RAW", d.id);
        else if (name === "Gallery Media") slugToId.set("Gallery Media", d.id);
      }
    }
    driveIdStr = slugToId.get(driveIdStr) ?? driveIdStr;
  }

  if (driveIdStr) {
    // Query by userId (primary); also by user_id for legacy docs
    const [filesByUserId, filesByUserIdSnake] = await Promise.all([
      db
        .collection("backup_files")
        .where("userId", "==", uid)
        .where("linked_drive_id", "==", driveIdStr)
        .where("deleted_at", "==", null)
        .get(),
      db
        .collection("backup_files")
        .where("user_id", "==", uid)
        .where("linked_drive_id", "==", driveIdStr)
        .where("deleted_at", "==", null)
        .get(),
    ]);
    const fileDocsById = new Map<string, QueryDocumentSnapshot>();
    for (const snap of [filesByUserId, filesByUserIdSnake]) {
      for (const doc of snap.docs) {
        fileDocsById.set(doc.id, doc);
      }
    }
    const filesSnap = { docs: Array.from(fileDocsById.values()) };

    const entries: MountMetadataEntry[] = [];
    const requestedPath = pathsArray[0] ?? "";

    for (const doc of filesSnap.docs) {
      const data = doc.data();
      if (data.deleted_at) continue; // Exclude soft-deleted files
      const relativePath = data.relative_path ?? "";
      const pathDir = relativePath.includes("/")
        ? relativePath.slice(0, relativePath.lastIndexOf("/"))
        : "";

      if (pathDir !== requestedPath) continue;

      const name = (relativePath.split("/").filter(Boolean).pop() ?? relativePath) || "?";
      entries.push({
        id: doc.id,
        name,
        path: relativePath,
        object_key: data.object_key ?? "",
        size_bytes: data.size_bytes ?? 0,
        modified_at: data.modified_at ?? null,
        type: "file",
        linked_drive_id: data.linked_drive_id ?? driveIdStr,
      });
    }

    const immediateSubfolders = new Set<string>();
    const prefix = requestedPath ? `${requestedPath}/` : "";
    for (const doc of filesSnap.docs) {
      const data = doc.data();
      if (data.deleted_at) continue;
      const relativePath = data.relative_path ?? "";
      if (!relativePath.startsWith(prefix) || relativePath === prefix) continue;
      const after = relativePath.slice(prefix.length);
      const firstSegment = after.split("/")[0];
      if (firstSegment) immediateSubfolders.add(requestedPath ? `${requestedPath}/${firstSegment}` : firstSegment);
    }

    for (const folderPath of immediateSubfolders) {
      const name = folderPath.split("/").filter(Boolean).pop() ?? folderPath;
      entries.push({
        id: `folder:${folderPath}`,
        name,
        path: folderPath,
        object_key: "",
        size_bytes: 0,
        modified_at: null,
        type: "folder",
        linked_drive_id: driveIdStr,
      });
    }

    return NextResponse.json({ entries });
  }

  // Fetch profile for power-up gating (hasEditor, hasGallerySuite)
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
  const rawDrives: Array<{ id: string; name: string; isCreatorRaw: boolean }> = [];
  for (const snap of [byUserId, byUserIdSnake]) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const data = d.data();
      if (data.deleted_at) continue;

      const isCreatorRaw = data.is_creator_raw === true;
      const rawName = data.name ?? "Drive";

      // Per-user power-up filter: only show drives user has access to
      if (rawName === "Storage" || rawName === "Uploads") {
        rawDrives.push({ id: d.id, name: "Storage", isCreatorRaw });
      } else if (isCreatorRaw) {
        if (hasEditor) rawDrives.push({ id: d.id, name: "RAW", isCreatorRaw });
      } else if (rawName === "Gallery Media") {
        if (hasGallerySuite) rawDrives.push({ id: d.id, name: "Gallery Media", isCreatorRaw });
      } else {
        rawDrives.push({ id: d.id, name: rawName, isCreatorRaw });
      }
    }
  }

  // Sort: Storage, RAW, Gallery Media, then custom (match web app)
  const order = (name: string) =>
    name === "Storage" ? 0 : name === "RAW" ? 1 : name === "Gallery Media" ? 2 : 3;
  rawDrives.sort((a, b) => order(a.name) - order(b.name));

  // Mount shows only system drives (Storage, RAW, Gallery Media) - no custom drives
  // Dedupe: only one of each system drive (user may have multiple linked drives with same name)
  const systemDrives = rawDrives.filter((d) =>
    ["Storage", "RAW", "Gallery Media"].includes(d.name)
  );
  const seenNames = new Set<string>();
  const visibleDrives = systemDrives.filter((d) => {
    if (seenNames.has(d.name)) return false;
    seenNames.add(d.name);
    return true;
  });

  const driveEntries: MountMetadataEntry[] = visibleDrives.map((d) => ({
    id: d.id,
    name: d.name,
    path: "",
    object_key: "",
    size_bytes: 0,
    modified_at: null,
    type: "folder" as const,
    linked_drive_id: d.id,
  }));

  return NextResponse.json({ entries: driveEntries });
}
