import { getAdminFirestore, getAdminStorage, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { NextResponse } from "next/server";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();
  const orgId = profileData?.organization_id as string | undefined;

  if (!orgId) {
    return NextResponse.json(
      { error: "You must be an organization admin to upload a logo" },
      { status: 403 }
    );
  }

  const access = await resolveEnterpriseAccess(uid, orgId);
  if (!access.isAdmin) {
    logEnterpriseSecurityEvent("enterprise_admin_denied", {
      uid,
      orgId,
      route: "enterprise/logo",
    });
    return NextResponse.json(
      { error: "You must be an organization admin to upload a logo" },
      { status: 403 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Request must be multipart/form-data" },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse form data" },
      { status: 400 }
    );
  }

  const file = formData.get("logo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No logo file provided" },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Use PNG, JPG, WebP, or GIF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Image must be under 2 MB" },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeExt = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)
    ? ext
    : "png";
  const storagePath = `organizations/${orgId}/logo.${safeExt}`;

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
    expires: "03-01-2500", // Far future for permanent URL
  });

  // Use getDownloadURL-style URL if available; signed URLs work but we can also make the file public
  // For simplicity, we'll use the signed URL or make it public
  const logoUrl = url;

  await db.collection("organizations").doc(orgId).update({
    logo_url: logoUrl,
  });

  return NextResponse.json({ logo_url: logoUrl });
}
