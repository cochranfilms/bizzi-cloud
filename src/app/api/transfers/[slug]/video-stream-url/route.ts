import { objectExists, getProxyObjectKey, isB2Configured } from "@/lib/b2";
import { getDownloadUrl } from "@/lib/cdn";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifySecret } from "@/lib/gallery-access";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const STREAM_EXPIRY_SEC = 3600; // 1 hour — prevents Access Denied when users pause or return to transfer previews

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const { slug } = await params;

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const objectKey = body.object_key ?? body.objectKey;
  const password = body.password as string | undefined;

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json(
      { error: "object_key is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const transferSnap = await db.collection("transfers").doc(slug).get();

  if (!transferSnap.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const transfer = transferSnap.data();
  if (!transfer) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const expiresAt = transfer.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    return NextResponse.json({ error: "Transfer expired" }, { status: 410 });
  }

  const status = transfer.status ?? "active";
  if (status !== "active") {
    return NextResponse.json({ error: "Transfer not available" }, { status: 410 });
  }

  const passwordHash = transfer.password_hash ?? null;
  const legacyPassword = transfer.password ?? null;
  const requiresPassword = !!passwordHash || !!legacyPassword;
  if (requiresPassword) {
    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password required or incorrect" },
        { status: 403 }
      );
    }
    if (passwordHash) {
      const ok = await verifySecret(password, passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: "Password required or incorrect" },
          { status: 403 }
        );
      }
    } else {
      const a = Buffer.from(password, "utf8");
      const b = Buffer.from(legacyPassword, "utf8");
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return NextResponse.json(
          { error: "Password required or incorrect" },
          { status: 403 }
        );
      }
    }
  }

  const files = (transfer.files ?? []) as Array<{
    object_key?: string;
    backup_file_id?: string;
  }>;
  const fileInTransfer = files.find(
    (f) => f.object_key === objectKey || f.backup_file_id === objectKey
  );

  if (!fileInTransfer) {
    return NextResponse.json(
      { error: "File not found in this transfer" },
      { status: 403 }
    );
  }

  const objKey = fileInTransfer.object_key ?? objectKey;
  if (!objKey) {
    return NextResponse.json(
      { error: "File has no object key" },
      { status: 400 }
    );
  }

  try {
    const proxyKey = getProxyObjectKey(objKey);
    const proxyExists = await objectExists(proxyKey);
    if (!proxyExists) {
      return NextResponse.json({
        processing: true,
        message: "Generating preview. Check back in a moment.",
        estimatedSeconds: 60,
      });
    }
    const streamUrl = await getDownloadUrl(proxyKey, STREAM_EXPIRY_SEC);
    return NextResponse.json({ streamUrl });
  } catch (err) {
    console.error("[transfer video-stream-url] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create stream URL",
      },
      { status: 500 }
    );
  }
}
