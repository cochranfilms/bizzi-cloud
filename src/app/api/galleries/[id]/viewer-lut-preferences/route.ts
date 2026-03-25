/**
 * PATCH /api/galleries/[id]/viewer-lut-preferences
 * Persist gallery-level client LUT preview prefs (any device). Same access rules as GET /view.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientEmailFromCookie } from "@/lib/client-session";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import {
  buildValidViewerLutIdSet,
  parseViewerLutPreferencesPatchBody,
} from "@/lib/gallery-viewer-lut-persist-server";
import { normalizeGalleryMediaMode } from "@/lib/gallery-media-mode";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) {
    return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseViewerLutPreferencesPatchBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const url = new URL(request.url);
  const password = url.searchParams.get("password") ?? undefined;
  const authHeader = request.headers.get("Authorization");
  const clientEmail = getClientEmailFromCookie(request.headers.get("Cookie"));

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const g = gallerySnap.data()!;
  const access = await verifyGalleryViewAccess(
    {
      photographer_id: g.photographer_id,
      access_mode: g.access_mode ?? "public",
      password_hash: g.password_hash,
      pin_hash: g.pin_hash,
      invited_emails: g.invited_emails ?? [],
      expiration_date: g.expiration_date,
    },
    { authHeader, password, clientEmail }
  );

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.code, message: access.message, needsPassword: access.needsPassword },
      { status: 403 }
    );
  }

  const galleryType = g.gallery_type === "video" ? "video" : "photo";
  const rawLibrary = (g.creative_lut_library ?? []) as Array<{ id?: string }>;
  const validIds = buildValidViewerLutIdSet(rawLibrary, galleryType);
  if (!validIds.has(parsed.value.selectedLutId)) {
    return NextResponse.json({ error: "selectedLutId is not allowed for this gallery" }, { status: 400 });
  }

  const mediaMode = normalizeGalleryMediaMode({
    media_mode: g.media_mode as string | null | undefined,
    source_format: g.source_format as string | null | undefined,
  });
  if (mediaMode !== "raw") {
    return NextResponse.json(
      { error: "Viewer LUT preferences apply only to RAW photo galleries" },
      { status: 400 }
    );
  }

  const coerceBool = (v: unknown): boolean | undefined => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const l = v.trim().toLowerCase();
      if (l === "true") return true;
      if (l === "false") return false;
    }
    return undefined;
  };
  const creativeConfig = (g.creative_lut_config ?? null) as { enabled?: unknown } | null;
  const legacyLut = (g.lut ?? null) as { enabled?: unknown } | null;
  const lutEnabled =
    coerceBool(creativeConfig?.enabled) ?? coerceBool(legacyLut?.enabled) ?? false;
  if (!lutEnabled) {
    return NextResponse.json(
      { error: "LUT preview is not enabled for this gallery" },
      { status: 400 }
    );
  }

  const now = new Date();
  const viewer_lut_preferences = {
    ...parsed.value,
    updated_at: now.toISOString(),
  };

  await db.collection("galleries").doc(galleryId).update({
    viewer_lut_preferences,
    updated_at: now,
  });

  return NextResponse.json({
    viewer_lut_preferences: {
      selectedLutId: parsed.value.selectedLutId,
      lutPreviewEnabled: parsed.value.lutPreviewEnabled,
      gradeMixPercent: parsed.value.gradeMixPercent,
    },
  });
}
