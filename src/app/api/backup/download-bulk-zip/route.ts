import { PassThrough, Readable } from "stream";
import archiver from "archiver";
import { getObject, isB2Configured } from "@/lib/b2";
import { verifyBackupFileAccess } from "@/lib/backup-access";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const MAX_ITEMS = 50;

/** Allow up to 5 min for very large zip streams (Vercel Pro: 300s). */
export const maxDuration = 300;

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

/** Deduplicates filenames for zip (e.g. image.jpg, image (1).jpg). */
function uniqueZipNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((raw) => {
    const base = raw.replace(/\.([^.]+)$/, "");
    const ext = raw.includes(".") ? raw.slice(raw.lastIndexOf(".")) : "";
    let name = raw;
    let n = 0;
    while (used.has(name)) {
      n++;
      name = `${base} (${n})${ext}`;
    }
    used.set(name, 1);
    return name;
  });
}

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

  // Verify access for all items before streaming
  for (const item of items) {
    const hasAccess = await verifyBackupFileAccess(uid, item.object_key);
    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied to one or more files" }, { status: 403 });
    }
  }

  const names = uniqueZipNames(items.map((i) => i.name));

  const archive = archiver("zip", {
    zlib: { level: 0 }, // No compression for speed; reduces CPU and supports large streams
  });

  archive.on("error", (err) => {
    console.error("[backup download-bulk-zip] Archive error:", err);
  });

  const passThrough = new PassThrough();
  archive.pipe(passThrough);

  // Start streaming: append each file from B2
  (async () => {
    try {
      for (let i = 0; i < items.length; i++) {
        const { object_key } = items[i];
        const name = names[i];
        const { body } = await getObject(object_key);
        // AWS SDK v3 returns Web ReadableStream; archiver needs Node.js Readable
        const nodeStream =
          typeof (body as { getReader?: unknown }).getReader === "function"
            ? Readable.fromWeb(body as any)
            : (body as NodeJS.ReadableStream);
        archive.append(nodeStream as import("stream").Readable, { name });
      }
      await archive.finalize();
    } catch (err) {
      console.error("[backup download-bulk-zip] Error:", err);
      archive.emit("error", err);
    }
  })();

  const webStream = Readable.toWeb(passThrough) as ReadableStream;
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="download.zip"',
    },
  });
}
