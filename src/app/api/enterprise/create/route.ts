import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { EnterpriseThemeId } from "@/types/enterprise";
import { ENTERPRISE_ORG_STORAGE_BYTES } from "@/lib/enterprise-storage";
import { syncOrganizationSeatAllocationSummary } from "@/lib/org-seat-allocation-summary";

export async function POST(request: Request) {
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
  let email: string | undefined;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length < 2) {
    return NextResponse.json(
      { error: "Organization name must be at least 2 characters" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  // Check if user already has an organization
  const profilesSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profilesSnap.data();
  if (profileData?.organization_id) {
    return NextResponse.json(
      { error: "You already belong to an organization" },
      { status: 400 }
    );
  }

  const batch = db.batch();

  const orgRef = db.collection("organizations").doc();
  const orgId = orgRef.id;

  const seatId = `${orgId}_${uid}`;
  const seatRef = db.collection("organization_seats").doc(seatId);

  const now = FieldValue.serverTimestamp();

  batch.set(orgRef, {
    name,
    theme: "bizzi" as EnterpriseThemeId,
    storage_quota_bytes: ENTERPRISE_ORG_STORAGE_BYTES,
    storage_used_bytes: 0,
    created_at: now,
    created_by: uid,
  });

  batch.set(seatRef, {
    organization_id: orgId,
    user_id: uid,
    role: "admin",
    email: email ?? "",
    display_name: null,
    invited_at: now,
    accepted_at: now,
    status: "active",
    quota_mode: "org_unlimited",
    storage_quota_bytes: null,
  });

  const profileRef = db.collection("profiles").doc(uid);
  batch.set(
    profileRef,
    {
      organization_id: orgId,
      organization_role: "admin",
    },
    { merge: true }
  );

  await batch.commit();

  await syncOrganizationSeatAllocationSummary(db, orgId);

  return NextResponse.json({
    organization_id: orgId,
    name,
  });
}
