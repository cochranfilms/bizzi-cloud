/**
 * Creator RAW drive LUT direct upload — returns signed upload URL.
 * Use for files > 4 MB (Vercel body limit). Client uploads to returned URL, then calls POST /lut with confirm payload.
 */
import { getAdminFirestore, getAdminStorage, verifyIdToken } from "@/lib/firebase-admin";
import { MAX_LUTS_PER_SCOPE } from "@/types/creative-lut";
import type { CreativeLUTLibraryEntry } from "@/types/creative-lut";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

const STORAGE_PREFIX = (driveId: string) => `drives/${driveId}/lut`;

async function requireDriveOwner(
  request: Request,
  driveId: string
): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    const uid = decoded.uid;
    const db = getAdminFirestore();
    const driveSnap = await db.collection("linked_drives").doc(driveId).get();
    if (!driveSnap.exists) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }
    const drive = driveSnap.data()!;
    if (drive.userId !== uid) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (!drive.is_creator_raw) {
      return NextResponse.json({ error: "LUT management is only for Creator RAW drives" }, { status: 400 });
    }
    return { uid };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: driveId } = await params;
  if (!driveId) return NextResponse.json({ error: "Drive ID required" }, { status: 400 });

  const auth = await requireDriveOwner(request, driveId);
  if (auth instanceof NextResponse) return auth;

  let body: { name?: string; extension?: string };
  try {
    body = (await request.json().catch(() => ({}))) as { name?: string; extension?: string };
  } catch {
    body = {};
  }

  const db = getAdminFirestore();
  const snap = await db.collection("linked_drives").doc(driveId).get();
  if (!snap.exists) return NextResponse.json({ error: "Drive not found" }, { status: 404 });

  const data = snap.data()!;
  const library: CreativeLUTLibraryEntry[] = (data.creative_lut_library ?? []) as CreativeLUTLibraryEntry[];
  const customCount = library.filter((e) => e.mode === "custom").length;
  if (customCount >= MAX_LUTS_PER_SCOPE) {
    return NextResponse.json(
      { error: `Maximum ${MAX_LUTS_PER_SCOPE} LUTs installed. Remove one to add another.` },
      { status: 400 }
    );
  }

  const ext =
    body.extension === "3dl" ? "3dl" : body.extension === "cube" ? "cube" : "cube";
  const entryId = randomUUID();
  const storagePath = `${STORAGE_PREFIX(driveId)}/${entryId}.${ext}`;

  const storage = getAdminStorage();
  const file = storage.bucket().file(storagePath);
  const [uploadUrl] = await file.getSignedUrl({
    action: "write",
    expires: "03-01-2500",
    contentType: "text/plain",
  });

  return NextResponse.json({
    upload_url: uploadUrl,
    entry_id: entryId,
    storage_path: storagePath,
    name: (body.name && typeof body.name === "string") ? body.name : null,
  });
}
