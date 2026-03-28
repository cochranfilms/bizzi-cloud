/**
 * POST /api/enterprise/leave
 * User leaves the organization they currently belong to (self-removal).
 * If sole admin: rejects with message to transfer ownership or add another admin first.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { suggestIdentityDeletionAfterOrgLeave } from "@/lib/identity-scope";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

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
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();
  const orgId = profileData?.organization_id as string | undefined;

  if (!orgId) {
    return NextResponse.json(
      { error: "You are not a member of any organization" },
      { status: 400 }
    );
  }

  const seatId = `${orgId}_${uid}`;
  const seatSnap = await db.collection("organization_seats").doc(seatId).get();

  if (!seatSnap.exists) {
    await db.collection("profiles").doc(uid).update({
      organization_id: FieldValue.delete(),
      organization_role: FieldValue.delete(),
    });
    logEnterpriseSecurityEvent("org_leave", { uid, orgId, repaired_profile_only: true });
    return NextResponse.json({ ok: true });
  }

  const adminSeatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("role", "==", "admin")
    .where("status", "==", "active")
    .get();

  const isSoleAdmin =
    adminSeatsSnap.docs.length === 1 &&
    adminSeatsSnap.docs[0].data().user_id === uid;

  if (isSoleAdmin) {
    return NextResponse.json(
      {
        error:
          "You cannot leave because you are the only admin. Transfer ownership to another member or add another admin first.",
        soleAdmin: true,
      },
      { status: 403 }
    );
  }

  await db.collection("organization_seats").doc(seatId).delete();

  await db.collection("profiles").doc(uid).update({
    organization_id: FieldValue.delete(),
    organization_role: FieldValue.delete(),
  });

  logEnterpriseSecurityEvent("org_leave", { uid, orgId });

  const personalStatus = profileData?.personal_status as string | undefined;

  return NextResponse.json({
    ok: true,
    suggestIdentityDeletion: suggestIdentityDeletionAfterOrgLeave(personalStatus),
  });
}
