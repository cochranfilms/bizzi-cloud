import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { hashSecret } from "@/lib/gallery-access";
import { slugify, ensureUniqueSlug } from "@/lib/gallery-slug";
import type { UpdateGalleryInput } from "@/types/gallery";
import { NextResponse } from "next/server";

async function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

/** GET /api/galleries/[id] – get gallery (owner only) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;
  const { id } = await params;

  if (!id) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const db = getAdminFirestore();
  const snap = await db.collection("galleries").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const data = snap.data()!;
  if (data.photographer_id !== uid) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return NextResponse.json({
    id: snap.id,
    ...data,
    created_at: data.created_at?.toDate?.()?.toISOString?.(),
    updated_at: data.updated_at?.toDate?.()?.toISOString?.(),
  });
}

/** PATCH /api/galleries/[id] – update gallery */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;
  const { id } = await params;

  if (!id) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as UpdateGalleryInput;

  const db = getAdminFirestore();
  const ref = db.collection("galleries").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const data = snap.data()!;
  if (data.photographer_id !== uid) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  const now = new Date();

  if (body.title !== undefined) updates.title = String(body.title).trim();
  if (body.cover_asset_id !== undefined) updates.cover_asset_id = body.cover_asset_id ?? null;
  if (body.cover_position !== undefined) updates.cover_position = body.cover_position ?? null;
  if (body.cover_focal_x !== undefined) updates.cover_focal_x = body.cover_focal_x ?? null;
  if (body.cover_focal_y !== undefined) updates.cover_focal_y = body.cover_focal_y ?? null;
  if (body.cover_alt_text !== undefined) updates.cover_alt_text = body.cover_alt_text?.trim() ?? null;
  if (body.cover_overlay_opacity !== undefined) updates.cover_overlay_opacity = body.cover_overlay_opacity ?? null;
  if (body.cover_title_alignment !== undefined) updates.cover_title_alignment = body.cover_title_alignment ?? null;
  if (body.cover_hero_height !== undefined) updates.cover_hero_height = body.cover_hero_height ?? null;
  if (body.description !== undefined) updates.description = body.description?.trim() ?? null;
  if (body.event_date !== undefined) updates.event_date = body.event_date ?? null;
  if (body.expiration_date !== undefined) updates.expiration_date = body.expiration_date ?? null;
  if (body.access_mode !== undefined) updates.access_mode = body.access_mode;
  if (Array.isArray(body.invited_emails)) {
    updates.invited_emails = body.invited_emails
      .filter((e): e is string => typeof e === "string")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  if (body.layout !== undefined) updates.layout = body.layout;
  if (body.branding !== undefined) {
    updates.branding = { ...data.branding, ...body.branding };
  }
  if (body.download_settings !== undefined) {
    updates.download_settings = { ...data.download_settings, ...body.download_settings };
  }
  if (body.watermark !== undefined) {
    updates.watermark = { ...data.watermark, ...body.watermark };
  }
  if (body.lut !== undefined) {
    updates.lut = { ...data.lut, ...body.lut };
  }

  if (body.access_mode === "password" && body.password) {
    updates.password_hash = await hashSecret(body.password);
  }
  if (body.access_mode !== undefined && body.access_mode !== "pin") {
    updates.pin_hash = null;
  }

  if (body.title && body.title !== data.title) {
    const baseSlug = slugify(body.title.trim());
    updates.slug = await ensureUniqueSlug(db, uid, baseSlug, id);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  updates.updated_at = now;
  await ref.update(updates);

  return NextResponse.json({ ok: true });
}

/** DELETE /api/galleries/[id] */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;
  const { id } = await params;

  if (!id) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const db = getAdminFirestore();
  const ref = db.collection("galleries").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  if (snap.data()!.photographer_id !== uid) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  await ref.delete();

  return NextResponse.json({ ok: true });
}
