import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { migrationRequireUid } from "@/lib/migration-require-auth";
import { getGoogleAccessToken } from "@/lib/migration-provider-account";
import { googleFetchDrivePreviewImage, googleGetFileMeta } from "@/lib/migration-google-drive-api";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

function isValidGoogleFileId(id: string): boolean {
  return /^[-_a-zA-Z0-9]{6,128}$/.test(id);
}

async function readBodyWithCap(res: Response, maxBytes: number): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const contentType = res.headers.get("content-type") ?? "image/png";
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new Error("too_large");
    }
    return { bytes: buf, contentType };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.byteLength) {
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error("too_large");
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return { bytes: out.buffer, contentType };
}

/**
 * Authenticated thumbnail/icon proxy for Google Drive import UI only.
 * GET ?fileId=&variant=thumbnail|icon — requires Authorization: Bearer (Firebase ID token).
 */
export async function GET(request: Request) {
  const auth = await migrationRequireUid(request);
  if (auth instanceof NextResponse) return auth;

  const rl = checkRateLimit(`migration_gdrv_preview:${auth.uid}`, 240, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", code: "rate_limited" }, { status: 429 });
  }

  const url = new URL(request.url);
  const fileId = url.searchParams.get("fileId")?.trim() ?? "";
  const variant = url.searchParams.get("variant") === "icon" ? "icon" : "thumbnail";

  if (!fileId || !isValidGoogleFileId(fileId)) {
    return NextResponse.json({ error: "Invalid fileId" }, { status: 400 });
  }

  const db = getAdminFirestore();
  let access: string;
  try {
    access = await getGoogleAccessToken(db, auth.uid);
  } catch {
    return NextResponse.json({ error: "Google Drive is not connected" }, { status: 403 });
  }

  let meta: Awaited<ReturnType<typeof googleGetFileMeta>>;
  try {
    meta = await googleGetFileMeta(access, fileId);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (meta.mimeType === "application/vnd.google-apps.folder") {
    return NextResponse.json({ error: "Folders have no preview" }, { status: 404 });
  }

  const imageUrl = variant === "icon" ? meta.iconLink?.trim() : meta.thumbnailLink?.trim();
  if (!imageUrl) {
    return NextResponse.json({ error: "No preview" }, { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await googleFetchDrivePreviewImage(access, imageUrl);
  } catch {
    return NextResponse.json({ error: "Preview fetch failed" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Preview unavailable" }, { status: upstream.status === 404 ? 404 : 502 });
  }

  let body: { bytes: ArrayBuffer; contentType: string };
  try {
    body = await readBodyWithCap(upstream, MAX_PREVIEW_BYTES);
  } catch {
    return NextResponse.json({ error: "Preview too large" }, { status: 413 });
  }

  return new NextResponse(body.bytes, {
    status: 200,
    headers: {
      "Content-Type": body.contentType.split(";")[0].trim() || "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
}
