/**
 * GET /api/profile - Return current user's profile (handle/public_slug, etc.)
 * PATCH /api/profile - Update profile fields (e.g. public_slug/handle)
 * Requires auth. Handle is same across personal and enterprise (per user/email).
 *
 * Profile field split (Option A): Webhook writes billing fields only (plan_id, storage_quota_bytes,
 * stripe_*, addon_ids, storage_addon_id); user PATCH writes profile fields only (public_slug,
 * share_image_*). No overlap, so no race between webhook and user updates.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { isReservedHandle } from "@/lib/public-handle";
import { NextResponse } from "next/server";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;

async function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(auth.uid).get();
  const data = profileSnap.data() ?? {};
  const handle = data.public_slug ?? null;
  const planId = (data.plan_id as string) ?? "free";
  const hasPortalAccess = !!data.stripe_customer_id;
  let addonIds = Array.isArray(data.addon_ids)
    ? (data.addon_ids as string[])
    : [];

  // For enterprise users, use org addon_ids instead of personal
  const orgId = data.organization_id as string | undefined;
  if (orgId) {
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgData = orgSnap.data();
    if (orgData && Array.isArray(orgData.addon_ids) && orgData.addon_ids.length > 0) {
      addonIds = orgData.addon_ids as string[];
    }
  }

  const storageAddonId =
    typeof data.storage_addon_id === "string" ? data.storage_addon_id : null;
  return NextResponse.json({
    public_slug: handle,
    handle,
    share_image_object_key: data.share_image_object_key ?? null,
    share_image_name: data.share_image_name ?? null,
    share_image_gallery_id: data.share_image_gallery_id ?? null,
    plan_id: planId,
    has_portal_access: hasPortalAccess,
    addon_ids: addonIds,
    storage_addon_id: storageAddonId,
  });
}

function slugifyPublicSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "";
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const body = await request.json().catch(() => ({}));
  const {
    public_slug: rawSlug,
    share_image_object_key,
    share_image_name,
    share_image_gallery_id,
  } = body;

  const db = getAdminFirestore();
  const profileRef = db.collection("profiles").doc(uid);

  const mergeUpdates: Record<string, unknown> = {};

  if (rawSlug !== undefined) {
    const slug = slugifyPublicSlug(typeof rawSlug === "string" ? rawSlug : "");
    if (slug && !SLUG_RE.test(slug)) {
      return NextResponse.json(
        { error: "Handle must be 3–40 characters, lowercase letters, numbers, and hyphens only" },
        { status: 400 }
      );
    }
    if (slug && isReservedHandle(slug)) {
      return NextResponse.json(
        { error: "This handle is reserved" },
        { status: 400 }
      );
    }
    if (slug) {
      const existing = await db
        .collection("profiles")
        .where("public_slug", "==", slug)
        .limit(1)
        .get();
      const conflict = existing.docs.find((d) => d.id !== uid);
      if (conflict) {
        return NextResponse.json(
          { error: "This username is already taken" },
          { status: 400 }
        );
      }
    }
    mergeUpdates.public_slug = slug || null;
  }

  if (share_image_object_key !== undefined) {
    const val =
      typeof share_image_object_key === "string" && share_image_object_key.trim()
        ? share_image_object_key.trim()
        : null;
    mergeUpdates.share_image_object_key = val;
    mergeUpdates.share_image_name =
      val && typeof share_image_name === "string"
        ? share_image_name.trim() || null
        : null;
    mergeUpdates.share_image_gallery_id =
      val && typeof share_image_gallery_id === "string"
        ? share_image_gallery_id.trim() || null
        : null;
  }

  if (Object.keys(mergeUpdates).length > 0) {
    await profileRef.set(mergeUpdates, { merge: true });
  }

  return NextResponse.json({ ok: true });
}
