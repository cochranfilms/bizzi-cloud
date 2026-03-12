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
  const driveIdStr = typeof driveId === "string" ? driveId : null;

  const db = getAdminFirestore();

  if (driveIdStr) {
    const filesSnap = await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("linked_drive_id", "==", driveIdStr)
      .get();

    const entries: MountMetadataEntry[] = [];
    const pathSet = new Set(pathsArray as string[]);

    for (const doc of filesSnap.docs) {
      const data = doc.data();
      if (data.deleted_at) continue; // Exclude soft-deleted files
      const relativePath = data.relative_path ?? "";
      const pathDir = relativePath.includes("/")
        ? relativePath.slice(0, relativePath.lastIndexOf("/"))
        : "";

      if (pathSet.size === 0 || pathSet.has(pathDir) || pathSet.has(relativePath)) {
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
    }

    const folderNames = new Set<string>();
    for (const e of entries) {
      const dir = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
      if (dir) {
        const parts = dir.split("/").filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
          folderNames.add(parts.slice(0, i).join("/"));
        }
      }
    }

    for (const folderPath of folderNames) {
      const name = folderPath.split("/").filter(Boolean).pop() ?? folderPath;
      if (!entries.some((e) => e.path === folderPath && e.type === "folder")) {
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

  const driveEntries: MountMetadataEntry[] = rawDrives.map((d) => ({
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
