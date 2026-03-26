import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminStorage, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { PERSONAL_TEAM_SETTINGS_COLLECTION } from "@/lib/personal-team-constants";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

/**
 * POST /api/personal-team/logo
 * Multipart form: logo (file), team_owner_uid (must match signed-in user).
 */
export async function POST(request: Request) {
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

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Request must be multipart/form-data" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 });
  }

  const teamOwnerUid = (formData.get("team_owner_uid") as string | null)?.trim() ?? "";
  if (!teamOwnerUid || teamOwnerUid !== uid) {
    return NextResponse.json({ error: "Only the team owner can upload a team logo" }, { status: 403 });
  }

  const file = formData.get("logo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No logo file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Use PNG, JPG, WebP, or GIF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeExt = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? ext : "png";
  const storagePath = `personal_team/${teamOwnerUid}/logo.${safeExt}`;

  const storage = getAdminStorage();
  const bucket = storage.bucket();
  const blob = bucket.file(storagePath);
  const buffer = Buffer.from(await file.arrayBuffer());
  await blob.save(buffer, {
    metadata: {
      contentType: file.type,
    },
  });

  const [url] = await blob.getSignedUrl({
    action: "read",
    expires: "03-01-2500",
  });

  const db = getAdminFirestore();
  const ref = db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(teamOwnerUid);
  const before = await ref.get();
  const payload: Record<string, unknown> = {
    team_owner_id: teamOwnerUid,
    logo_url: url,
    updated_at: FieldValue.serverTimestamp(),
  };
  if (!before.exists) {
    payload.created_at = FieldValue.serverTimestamp();
  }
  await ref.set(payload, { merge: true });

  return NextResponse.json({ logo_url: url });
}
