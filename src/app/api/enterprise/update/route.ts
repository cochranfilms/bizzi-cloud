import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { NextResponse } from "next/server";
import type { EnterpriseThemeId } from "@/types/enterprise";

const VALID_THEMES: EnterpriseThemeId[] = [
  "bizzi",
  "slate",
  "emerald",
  "violet",
  "amber",
  "rose",
  "teal",
];

export async function PATCH(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  let body: { name?: string; theme?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;
  if (!orgId) {
    return NextResponse.json(
      { error: "You must be an organization admin to update settings" },
      { status: 403 }
    );
  }

  const access = await resolveEnterpriseAccess(uid, orgId);
  if (!access.isAdmin) {
    logEnterpriseSecurityEvent("enterprise_admin_denied", {
      uid,
      orgId,
      route: "enterprise/update",
    });
    return NextResponse.json(
      { error: "You must be an organization admin to update settings" },
      { status: 403 }
    );
  }

  const updates: Record<string, unknown> = {};
  const profileData = profileSnap.data();

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (trimmed.length < 2) {
      return NextResponse.json(
        { error: "Organization name must be at least 2 characters" },
        { status: 400 }
      );
    }
    updates.name = trimmed;
  }

  if (typeof body.theme === "string") {
    if (!VALID_THEMES.includes(body.theme as EnterpriseThemeId)) {
      return NextResponse.json(
        { error: "Invalid theme" },
        { status: 400 }
      );
    }
    updates.theme = body.theme;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await db.collection("organizations").doc(orgId).update(updates);

  return NextResponse.json({ ok: true });
}
