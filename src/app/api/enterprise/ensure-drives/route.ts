/**
 * POST /api/enterprise/ensure-drives
 * Ensure default drives (Storage, RAW, Gallery Media) exist for the current user
 * based on their organization's add-ons. Idempotent - safe to call repeatedly.
 * Fixes enterprise users who joined before we created drives on accept-invite.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { ensureDefaultDrivesForOrgUser } from "@/lib/ensure-default-drives";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;

  if (!orgId) {
    return NextResponse.json(
      { error: "Not an organization member" },
      { status: 400 }
    );
  }

  const access = await resolveEnterpriseAccess(uid, orgId);
  if (!access.canAccessEnterprise) {
    return NextResponse.json(
      { error: "Not a member of this organization" },
      { status: 403 }
    );
  }

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgAddonIds = Array.isArray(orgSnap.data()?.addon_ids)
    ? (orgSnap.data()?.addon_ids as string[])
    : [];

  try {
    await ensureDefaultDrivesForOrgUser(uid, orgId, orgAddonIds);
  } catch (err) {
    console.error("[ensure-drives] Failed:", err);
    return NextResponse.json(
      { error: "Failed to ensure drives" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
