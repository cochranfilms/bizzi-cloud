/**
 * GET /api/profile - Return current user's profile (handle/public_slug, etc.)
 * PATCH /api/profile - Update profile fields (e.g. public_slug/handle)
 * Requires auth. Handle is same across personal and enterprise (per user/email).
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
  return NextResponse.json({
    public_slug: handle,
    handle,
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
  const { public_slug: rawSlug } = body;

  const db = getAdminFirestore();
  const profileRef = db.collection("profiles").doc(uid);

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
    await profileRef.set({ public_slug: slug || null }, { merge: true });
  }

  return NextResponse.json({ ok: true });
}
