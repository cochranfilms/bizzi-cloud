import { objectExists, getProxyObjectKey } from "@/lib/b2";
import { getDownloadUrl, isB2Configured } from "@/lib/cdn";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

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

  const transferPassword = transfer.password ?? null;
  if (transferPassword && transferPassword !== password) {
    return NextResponse.json(
      { error: "Password required or incorrect" },
      { status: 403 }
    );
  }

  const files = (transfer.files ?? []) as Array<{
    id: string;
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
    const effectiveKey = (await objectExists(proxyKey)) ? proxyKey : objKey;
    const url = await getDownloadUrl(effectiveKey, 3600);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Transfer preview URL error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create preview URL",
      },
      { status: 500 }
    );
  }
}
