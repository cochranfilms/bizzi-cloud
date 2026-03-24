/**
 * Creator RAW drive LUT Library API
 * GET: return creative_lut_config + creative_lut_library (only for is_creator_raw drives)
 * POST: add LUT
 * PATCH: update config
 * DELETE: remove entry
 */
import { getAdminFirestore, getAdminStorage, verifyIdToken } from "@/lib/firebase-admin";
import { validateLutFileForUpload } from "@/lib/creative-lut/parse-lut";
import { MAX_LUTS_PER_SCOPE } from "@/types/creative-lut";
import type { CreativeLUTConfig, CreativeLUTLibraryEntry } from "@/types/creative-lut";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
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
  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
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
}

async function refreshSignedUrl(storagePath: string): Promise<string> {
  const storage = getAdminStorage();
  const [url] = await storage.bucket().file(storagePath).getSignedUrl({
    action: "read",
    expires: "03-01-2500",
  });
  return url;
}

/** GET */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: driveId } = await params;
  if (!driveId) return NextResponse.json({ error: "Drive ID required" }, { status: 400 });

  const auth = await requireDriveOwner(request, driveId);
  if (auth instanceof NextResponse) return auth;

  const db = getAdminFirestore();
  const snap = await db.collection("linked_drives").doc(driveId).get();
  if (!snap.exists) return NextResponse.json({ error: "Drive not found" }, { status: 404 });

  const data = snap.data()!;
  let config: CreativeLUTConfig = (data.creative_lut_config ?? {}) as CreativeLUTConfig;
  let library: CreativeLUTLibraryEntry[] = (data.creative_lut_library ?? []) as CreativeLUTLibraryEntry[];

  if (!config.applies_to) {
    config = { ...config, applies_to: "creator_raw_video" };
  }

  const libraryWithUrls = await Promise.all(
    library.map(async (entry) => {
      if (entry.mode === "custom" && entry.storage_path) {
        try {
          const url = await refreshSignedUrl(entry.storage_path);
          return { ...entry, signed_url: url };
        } catch {
          return entry;
        }
      }
      return entry;
    })
  );

  return NextResponse.json({
    creative_lut_config: config,
    creative_lut_library: libraryWithUrls,
  });
}

const VERCEL_BODY_LIMIT = 4 * 1024 * 1024; // 4 MB — stay under Vercel's 4.5 MB limit

/** POST: multipart (small files) or JSON confirm (direct upload for large files) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: driveId } = await params;
  if (!driveId) return NextResponse.json({ error: "Drive ID required" }, { status: 400 });

  const auth = await requireDriveOwner(request, driveId);
  if (auth instanceof NextResponse) return auth;

  const contentType = request.headers.get("content-type") ?? "";

  // Direct upload confirm: JSON with entry_id, storage_path, name (for files > 4 MB)
  if (contentType.includes("application/json")) {
    let body: { entry_id?: string; storage_path?: string; name?: string };
    try {
      body = (await request.json()) as { entry_id?: string; storage_path?: string; name?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const entryId = body.entry_id;
    const storagePath = body.storage_path;
    if (!entryId || !storagePath || typeof storagePath !== "string") {
      return NextResponse.json({ error: "entry_id and storage_path required" }, { status: 400 });
    }
    const expectedPrefix = STORAGE_PREFIX(driveId);
    if (
      !storagePath.startsWith(expectedPrefix) ||
      (!storagePath.endsWith(".cube") && !storagePath.endsWith(".3dl"))
    ) {
      return NextResponse.json({ error: "Invalid storage_path" }, { status: 400 });
    }
    const storage = getAdminStorage();
    const fileRef = storage.bucket().file(storagePath);
    const [exists] = await fileRef.exists();
    if (!exists) {
      return NextResponse.json({ error: "Upload not found. Upload the file to the signed URL first." }, { status: 400 });
    }
    const [buf] = await fileRef.download();
    const lutValidation = validateLutFileForUpload(buf.toString("utf8"));
    if (!lutValidation.valid) {
      return NextResponse.json({ error: lutValidation.error }, { status: 400 });
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
    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });
    const fileName = storagePath.split("/").pop() ?? "custom.cube";
    const lutExt = storagePath.endsWith(".3dl") ? "3dl" : "cube";
    const name =
      body.name && typeof body.name === "string"
        ? body.name
        : fileName.replace(/\.(cube|3dl)$/i, "") || "Custom LUT";
    const newEntry: CreativeLUTLibraryEntry = {
      id: entryId,
      mode: "custom",
      name,
      file_type: lutExt,
      file_name: fileName,
      storage_path: storagePath,
      signed_url: signedUrl,
      builtin_lut_id: null,
      input_profile: null,
      output_profile: null,
      uploaded_by: auth.uid,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const updatedLibrary = [...library, newEntry];
    const config = (data.creative_lut_config ?? {}) as CreativeLUTConfig;
    await db.collection("linked_drives").doc(driveId).update({
      creative_lut_config: {
        enabled: config.enabled ?? true,
        selected_lut_id: config.selected_lut_id ?? newEntry.id,
        intensity: config.intensity ?? 1,
        applies_to: "creator_raw_video",
        updated_at: new Date().toISOString(),
        updated_by: auth.uid,
      },
      creative_lut_library: updatedLibrary,
    });
    return NextResponse.json({ entry: newEntry });
  }

  // Multipart form upload (small files < 4 MB)
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Request must be multipart/form-data or application/json" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 });
  }

  const file = formData.get("lut");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No LUT file provided" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "cube" && ext !== "3dl") {
    return NextResponse.json({ error: "Only .cube or .3dl LUT files are supported" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "LUT file must be under 20 MB" }, { status: 400 });
  }
  if (file.size > VERCEL_BODY_LIMIT) {
    return NextResponse.json(
      { error: "Files over 4 MB must use direct upload. Please try again." },
      { status: 400 }
    );
  }

  const text = await file.text();
  const validation = validateLutFileForUpload(text);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
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

  const entryId = randomUUID();
  const storagePath = `${STORAGE_PREFIX(driveId)}/${entryId}.${ext}`;

  const storage = getAdminStorage();
  await storage.bucket().file(storagePath).save(Buffer.from(text), {
    metadata: { contentType: "text/plain" },
  });

  const [signedUrl] = await storage.bucket().file(storagePath).getSignedUrl({
    action: "read",
    expires: "03-01-2500",
  });

  const name =
    (formData.get("name") as string) || file.name.replace(/\.(cube|3dl)$/i, "") || "Custom LUT";

  const newEntry: CreativeLUTLibraryEntry = {
    id: entryId,
    mode: "custom",
    name,
    file_type: ext === "3dl" ? "3dl" : "cube",
    file_name: file.name,
    storage_path: storagePath,
    signed_url: signedUrl,
    builtin_lut_id: null,
    input_profile: null,
    output_profile: null,
    uploaded_by: auth.uid,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const updatedLibrary = [...library, newEntry];
  const config = (data.creative_lut_config ?? {}) as CreativeLUTConfig;

  await db.collection("linked_drives").doc(driveId).update({
    creative_lut_config: {
      enabled: config.enabled ?? true,
      selected_lut_id: config.selected_lut_id ?? newEntry.id,
      intensity: config.intensity ?? 1,
      applies_to: "creator_raw_video",
      updated_at: new Date().toISOString(),
      updated_by: auth.uid,
    },
    creative_lut_library: updatedLibrary,
  });

  return NextResponse.json({ entry: newEntry });
}

/** PATCH */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: driveId } = await params;
  if (!driveId) return NextResponse.json({ error: "Drive ID required" }, { status: 400 });

  const auth = await requireDriveOwner(request, driveId);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const snap = await db.collection("linked_drives").doc(driveId).get();
  if (!snap.exists) return NextResponse.json({ error: "Drive not found" }, { status: 404 });

  const data = snap.data()!;
  const config = (data.creative_lut_config ?? {}) as CreativeLUTConfig;
  const library = (data.creative_lut_library ?? []) as CreativeLUTLibraryEntry[];

  const selectedLutId =
    body.selected_lut_id !== undefined
      ? (typeof body.selected_lut_id === "string" ? body.selected_lut_id : null)
      : config.selected_lut_id;
  const updates: Partial<CreativeLUTConfig> = {
    enabled: typeof body.enabled === "boolean" ? body.enabled : (config.enabled ?? false),
    selected_lut_id: selectedLutId,
    intensity: typeof body.intensity === "number" ? body.intensity : (config.intensity ?? 1),
    applies_to: "creator_raw_video",
    updated_at: new Date().toISOString(),
    updated_by: auth.uid,
  };

  let updatedLibrary = library;
  if (body.entry_id && body.name && typeof body.name === "string") {
    updatedLibrary = library.map((e) =>
      e.id === body.entry_id ? { ...e, name: body.name as string, updated_at: new Date().toISOString() } : e
    );
  }

  if (updates.selected_lut_id) {
    const exists = updatedLibrary.some((e) => e.id === updates.selected_lut_id) ||
      updates.selected_lut_id === "sony_rec709";
    if (!exists) updates.selected_lut_id = "sony_rec709";
  }

  await db.collection("linked_drives").doc(driveId).update({
    creative_lut_config: { ...config, ...updates },
    creative_lut_library: updatedLibrary,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: driveId } = await params;
  if (!driveId) return NextResponse.json({ error: "Drive ID required" }, { status: 400 });

  const auth = await requireDriveOwner(request, driveId);
  if (auth instanceof NextResponse) return auth;

  let body: { entry_id?: string };
  try {
    body = (await request.json().catch(() => ({}))) as { entry_id?: string };
  } catch {
    body = {};
  }

  const entryId = body.entry_id;
  if (!entryId) return NextResponse.json({ error: "entry_id required" }, { status: 400 });

  const db = getAdminFirestore();
  const snap = await db.collection("linked_drives").doc(driveId).get();
  if (!snap.exists) return NextResponse.json({ error: "Drive not found" }, { status: 404 });

  const data = snap.data()!;
  const library = (data.creative_lut_library ?? []) as CreativeLUTLibraryEntry[];
  const config = (data.creative_lut_config ?? {}) as CreativeLUTConfig;

  const entry = library.find((e) => e.id === entryId);
  if (!entry) return NextResponse.json({ error: "LUT entry not found" }, { status: 404 });

  if (entry.storage_path) {
    try {
      await getAdminStorage().bucket().file(entry.storage_path).delete();
    } catch {
      // ignore
    }
  }

  const updatedLibrary = library.filter((e) => e.id !== entryId);
  let selectedId = config.selected_lut_id;
  if (selectedId === entryId) {
    selectedId = updatedLibrary[0]?.id ?? "sony_rec709";
  }

  await db.collection("linked_drives").doc(driveId).update({
    creative_lut_config: {
      ...config,
      selected_lut_id: selectedId,
      updated_at: new Date().toISOString(),
      updated_by: auth.uid,
    },
    creative_lut_library: updatedLibrary,
  });

  return NextResponse.json({ ok: true });
}
