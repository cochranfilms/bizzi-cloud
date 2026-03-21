/**
 * POST /api/galleries/[id]/download-bulk-zip
 * Body: { items: [{ object_key, name }][], password?, download_context?: "full" | "selected" }
 * Streams a ZIP of multiple gallery assets. Verifies gallery download access.
 */
import { isB2Configured } from "@/lib/b2";
import { streamZipFromB2 } from "@/lib/stream-zip-from-b2";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { verifyGalleryDownloadAccess } from "@/lib/gallery-access";
import { getClientEmailFromCookie } from "@/lib/client-session";
import {
  getGalleryDownloadClientId,
  checkAndIncrementDownloadCountBulk,
} from "@/lib/gallery-download-tracking";
import { NextResponse } from "next/server";

const MAX_ITEMS = 50;

/** Allow up to 5 min for very large zip streams (Vercel Pro: 300s). */
export const maxDuration = 300;

/** Requires Node.js for stream/archiver (not Edge). */
export const runtime = "nodejs";

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
  { params }: { params: Promise<{ id: string }> }
) {
  const run = async (): Promise<Response> => {
    const { id: galleryId } = await params;
    if (!galleryId)
    return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

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

  const { items: rawItems, password: passwordRaw, download_context: downloadContext } = body;
  const password =
    typeof passwordRaw === "string" || passwordRaw === null
      ? passwordRaw
      : undefined;
  const downloadCtx = (downloadContext as "full" | "selected") ?? "selected";

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

  const authHeader = request.headers.get("Authorization");
  const clientEmail = getClientEmailFromCookie(request.headers.get("Cookie"));

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists)
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const g = gallerySnap.data()!;
  const access = await verifyGalleryDownloadAccess(
      {
        photographer_id: g.photographer_id,
        access_mode: g.access_mode ?? "public",
        password_hash: g.password_hash,
        pin_hash: g.pin_hash,
        invited_emails: g.invited_emails ?? [],
        expiration_date: g.expiration_date,
      },
      { authHeader, password: password ?? null, clientEmail }
    );

  if (!access.allowed) {
    return NextResponse.json(
      {
        error: access.code,
        message: access.message,
        needsPassword: access.needsPassword,
      },
      { status: 403 }
    );
  }

  let isOwner = false;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = await verifyIdToken(authHeader.slice(7).trim());
      if (decoded.uid === g.photographer_id) isOwner = true;
    } catch {
      /* not owner */
    }
  }

  const galleryType = g.gallery_type === "video" ? "video" : "photo";

  if (!isOwner) {
    if (galleryType === "video") {
      const invoiceRequired = g.invoice_required_for_download === true;
      const invoiceStatus = g.invoice_status ?? "none";
      if (invoiceRequired && invoiceStatus !== "paid") {
        return NextResponse.json(
          {
            error: "invoice_required",
            message: "Payment is required before downloads are available.",
            invoice_url: g.invoice_url ?? null,
          },
          { status: 403 }
        );
      }
      const downloadPolicy = g.download_policy ?? "none";
      if (downloadPolicy === "none") {
        return NextResponse.json(
          {
            error: "download_disabled",
            message: "Downloads are not enabled for this video gallery.",
          },
          { status: 403 }
        );
      }
    }

    const downloadSettings = g.download_settings ?? {};
    if (downloadCtx === "full" && !downloadSettings.allow_full_gallery_download) {
      return NextResponse.json(
        {
          error: "download_disabled",
          message: "Full gallery download is not allowed for this gallery.",
        },
        { status: 403 }
      );
    }
    if (downloadCtx === "selected" && !downloadSettings.allow_selected_download) {
      return NextResponse.json(
        {
          error: "download_disabled",
          message: "Selected favorites download is not allowed for this gallery.",
        },
        { status: 403 }
      );
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

  if (rawItemsTyped.length === 0) {
    return NextResponse.json(
      { error: "No valid items with object_key" },
      { status: 400 }
    );
  }

  const assetsSnap = await db
    .collection("gallery_assets")
    .where("gallery_id", "==", galleryId)
    .where("is_visible", "==", true)
    .get();

  const objectKeyToAsset = new Map<string, { name: string; is_downloadable: boolean }>();
  for (const doc of assetsSnap.docs) {
    const d = doc.data();
    const key = d.object_key as string;
    if (key) {
      objectKeyToAsset.set(key, {
        name: (d.name as string) ?? "download",
        is_downloadable: d.is_downloadable === true,
      });
    }
  }

  const items: { object_key: string; name: string }[] = [];
  for (const raw of rawItemsTyped) {
    const asset = objectKeyToAsset.get(raw.object_key);
    if (!asset) {
      return NextResponse.json(
        { error: `Asset not found or not visible: ${raw.object_key}` },
        { status: 403 }
      );
    }
    if (!isOwner && galleryType === "video") {
      const downloadPolicy = g.download_policy ?? "none";
      if (downloadPolicy === "selected_assets" && !asset.is_downloadable) {
        return NextResponse.json(
          {
            error: "download_disabled",
            message: "One or more assets are not available for download.",
          },
          { status: 403 }
        );
      }
    }
    items.push({ object_key: raw.object_key, name: asset.name || raw.name });
  }

  if (!isOwner) {
    const freeLimit = (g.download_settings ?? {}).free_download_limit;
    if (typeof freeLimit === "number" && freeLimit >= 0) {
      const clientId = getGalleryDownloadClientId(request);
      const { allowed, used } =
        await checkAndIncrementDownloadCountBulk(
          db,
          galleryId,
          clientId,
          freeLimit,
          items.length
        );
      if (!allowed) {
        return NextResponse.json(
          {
            error: "download_limit_reached",
            message: `You've reached the free download limit (${freeLimit}) for this gallery.`,
            used,
            limit: freeLimit,
          },
          { status: 403 }
        );
      }
    }
  }

    const names = uniqueZipNames(items.map((i) => i.name));
    return streamZipFromB2(
      items.map((item, i) => ({ object_key: item.object_key, name: names[i]! }))
    );
  };
  return run().catch((err: unknown) => {
    console.error("[download-bulk-zip] Unexpected error:", err);
    return NextResponse.json(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "An unexpected error occurred",
      },
      { status: 500 }
    );
  });
}
} // SWC workaround: Next.js 15 parser expects one extra closing brace
