/**
 * POST /api/transfers/[slug]/download-bulk-zip
 * Body: { items: [{ object_key, name }][], password? }
 * Streams a ZIP of multiple transfer files. Verifies transfer access and permission.
 */
import { PassThrough, Readable } from "stream";
import archiver from "archiver";
import { getObject, isB2Configured } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifySecret } from "@/lib/gallery-access";
import { loadTransferFilesForApi, transferIsRecipientVisible } from "@/lib/transfer-resolve";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const MAX_ITEMS = 50;

/** Allow up to 5 min for very large zip streams (Vercel Pro: 300s). */
export const maxDuration = 300;

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { items: rawItems, password } = body;

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

  const db = getAdminFirestore();
  const transferSnap = await db.collection("transfers").doc(slug).get();
  if (!transferSnap.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const transfer = transferSnap.data();
  if (!transfer) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  if (!transferIsRecipientVisible(transfer as Record<string, unknown>)) {
    return NextResponse.json({ error: "Transfer not available" }, { status: 403 });
  }

  const expiresAt = transfer.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    return NextResponse.json({ error: "Transfer expired" }, { status: 410 });
  }

  const status = transfer.status ?? "active";
  if (status !== "active") {
    return NextResponse.json({ error: "Transfer not available" }, { status: 410 });
  }

  const permission = (transfer.permission ?? "downloadable") as "view" | "downloadable";
  if (permission === "view") {
    return NextResponse.json(
      { error: "Downloads are disabled for this transfer" },
      { status: 403 }
    );
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
      const ok = await verifySecret(password as string, passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: "Password required or incorrect" },
          { status: 403 }
        );
      }
    } else {
      const a = Buffer.from(password as string, "utf8");
      const b = Buffer.from(legacyPassword, "utf8");
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return NextResponse.json(
          { error: "Password required or incorrect" },
          { status: 403 }
        );
      }
    }
  }

  const files = await loadTransferFilesForApi(
    db,
    slug,
    transfer as Record<string, unknown>
  );
  const fileKeySet = new Set<string>();
  const keyToName = new Map<string, string>();
  for (const f of files) {
    const objKey = f.object_key ?? f.backup_file_id;
    if (objKey) {
      fileKeySet.add(objKey);
      keyToName.set(objKey, (f.name as string) ?? "download");
    }
  }

  const rawItemsTyped = rawItems
    .filter((x): x is { object_key: string; name?: string } =>
      x != null &&
      typeof x === "object" &&
      typeof (x as { object_key?: unknown }).object_key === "string"
    )
    .map((x) => ({
      object_key: (x as { object_key: string }).object_key,
      name:
        typeof (x as { name?: string }).name === "string"
          ? (x as { name: string }).name
          : "download",
    }));

  const items: { object_key: string; name: string }[] = [];
  for (const raw of rawItemsTyped) {
    if (!fileKeySet.has(raw.object_key)) {
      return NextResponse.json(
        { error: `File not found in this transfer: ${raw.object_key}` },
        { status: 403 }
      );
    }
    const name = keyToName.get(raw.object_key) ?? raw.name;
    items.push({ object_key: raw.object_key, name });
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "No valid items with object_key" },
      { status: 400 }
    );
  }

  const names = uniqueZipNames(items.map((i) => i.name));

  const archive = archiver("zip", {
    zlib: { level: 0 },
  });

  archive.on("error", (err) => {
    console.error("[transfer download-bulk-zip] Archive error:", err);
  });

  const passThrough = new PassThrough();
  archive.pipe(passThrough);

  (async () => {
    try {
      for (let i = 0; i < items.length; i++) {
        const { object_key } = items[i];
        const name = names[i];
        const { body: objBody } = await getObject(object_key);
        const nodeStream =
          typeof (objBody as { getReader?: unknown }).getReader === "function"
            ? Readable.fromWeb(objBody as any)
            : (objBody as NodeJS.ReadableStream);
        archive.append(nodeStream as import("stream").Readable, { name });
      }
      await archive.finalize();
    } catch (err) {
      console.error("[transfer download-bulk-zip] Error:", err);
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
