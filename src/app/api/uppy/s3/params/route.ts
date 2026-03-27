/**
 * Uppy S3 API — Presigned PUT URL for single-chunk uploads (files ≤5MB).
 * GET /api/uppy/s3/params?filename=...&type=...&metadata[driveId]=...&metadata[relativePath]=...&metadata[sizeBytes]=...
 * Returns: { method, url, fields, headers }
 */
import { createPresignedUploadUrl, isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { checkUserCanUpload } from "@/lib/enterprise-storage";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function GET(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename") ?? "";
  const type = searchParams.get("type") ?? "application/octet-stream";

  const metadata: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    const m = key.match(/^metadata\[(.+)\]$/);
    if (m) metadata[m[1]] = value;
  });

  const driveId = metadata.driveId ?? metadata.drive_id;
  const relativePath = metadata.relativePath ?? metadata.relative_path ?? filename;
  const sizeBytes = parseInt(metadata.sizeBytes ?? metadata.size_bytes ?? "0", 10);

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && metadata.user_id) {
    uid = metadata.user_id;
  } else if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  if (!driveId || !relativePath || !sizeBytes || sizeBytes <= 0) {
    return NextResponse.json(
      { error: "metadata must include driveId, relativePath, sizeBytes" },
      { status: 400 }
    );
  }

  const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");

  try {
    await checkUserCanUpload(uid, sizeBytes, driveId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage limit reached";
    return NextResponse.json({ error: msg }, { status: 403 });
  }

  const objectKey = `backups/${uid}/${driveId}/${safePath}`;
  // Do not bind Content-Type in the presigned URL — mismatches (e.g. FCP bundles, octet-stream)
  // cause net::ERR_ACCESS_DENIED from B2. Multipart path still sets a type on CreateMultipartUpload.
  try {
    const url = await createPresignedUploadUrl(objectKey, undefined, 3600);
    return NextResponse.json({
      method: "PUT",
      url,
      fields: {},
      headers: {
        "x-amz-server-side-encryption": "AES256",
      },
    });
  } catch (err) {
    console.error("[uppy s3/params] B2 error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create upload URL" },
      { status: 500 }
    );
  }
}
