import { createPresignedDownloadUrl, isB2Configured } from "@/lib/b2";
import { verifyBackupFileAccessWithLifecycle } from "@/lib/backup-access";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const MAX_ITEMS = 50;
const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { items: rawItems, user_id: userIdFromBody } = body;

  let uid: string;
  if (isDevAuthBypass() && typeof userIdFromBody === "string") {
    uid = userIdFromBody;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return NextResponse.json(
      { error: "items array is required and must not be empty" },
      { status: 400 }
    );
  }

  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ITEMS} files per download` },
      { status: 400 }
    );
  }

  const items = rawItems
    .filter((x): x is { object_key: string; name?: string } =>
      x != null && typeof x === "object" && typeof (x as { object_key?: unknown }).object_key === "string"
    )
    .map((x) => ({
      object_key: (x as { object_key: string }).object_key,
      name: typeof (x as { name?: string }).name === "string" ? (x as { name: string }).name : "download",
    }));

  if (items.length === 0) {
    return NextResponse.json(
      { error: "No valid items with object_key" },
      { status: 400 }
    );
  }

  const urls: { url: string; name: string }[] = [];

  for (const item of items) {
    const result = await verifyBackupFileAccessWithLifecycle(uid, item.object_key);
    if (!result.allowed) {
      return NextResponse.json(
        { error: result.message ?? "Access denied to one or more files" },
        { status: result.status ?? 403 }
      );
    }

    try {
      const url = await createPresignedDownloadUrl(item.object_key, 3600, item.name);
      urls.push({ url, name: item.name });
    } catch (err) {
      console.error("[backup download-bulk] Error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to create download URLs" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ urls });
}
