import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { checkInviteRateLimit } from "@/lib/enterprise-invite-rate-limit";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { NextResponse } from "next/server";
import { ORGANIZATION_INVITES_COLLECTION } from "@/lib/organization-invites";

/** GET - List pending invites for the current user's email. */
export async function GET(request: Request) {
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

  const listRl = await checkInviteRateLimit("pending_invites_list", uid, 40, 60_000);
  if (!listRl.ok) {
    logEnterpriseSecurityEvent("invite_rate_limited", {
      uid,
      kind: "pending_invites_list",
      retryAfterSec: listRl.retryAfterSec,
    });
    return NextResponse.json(
      {
        error: "Too many requests. Try again in a moment.",
        retry_after_sec: listRl.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(listRl.retryAfterSec) } }
    );
  }

  if (!email) {
    return NextResponse.json({ invites: [] });
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  if (profileSnap.data()?.organization_id) {
    return NextResponse.json({ invites: [] });
  }

  const emailLower = email.toLowerCase();

  const [invSnap, legacySnap] = await Promise.all([
    db
      .collection(ORGANIZATION_INVITES_COLLECTION)
      .where("email", "==", emailLower)
      .where("status", "==", "pending")
      .get(),
    db
      .collection("organization_seats")
      .where("email", "==", emailLower)
      .where("status", "==", "pending")
      .get(),
  ]);

  const orgIds = new Set<string>();
  for (const d of [...invSnap.docs, ...legacySnap.docs]) {
    const oid = d.data().organization_id as string | undefined;
    if (oid) orgIds.add(oid);
  }

  const orgNames = new Map<string, string>();
  await Promise.all(
    [...orgIds].map(async (orgId) => {
      const orgSnap = await db.collection("organizations").doc(orgId).get();
      orgNames.set(orgId, orgSnap.exists ? (orgSnap.data()?.name as string) ?? "" : "");
    })
  );

  const invites = [
    ...invSnap.docs.map((docSnap) => {
      const d = docSnap.data();
      const orgId = d.organization_id as string;
      return {
        seat_id: docSnap.id,
        organization_id: orgId,
        organization_name: orgNames.get(orgId) ?? "",
        email: d.email,
        invited_at: d.invited_at?.toDate?.()?.toISOString() ?? null,
      };
    }),
    ...legacySnap.docs.map((docSnap) => {
      const d = docSnap.data();
      const orgId = d.organization_id as string;
      return {
        seat_id: docSnap.id,
        organization_id: orgId,
        organization_name: orgNames.get(orgId) ?? "",
        email: d.email,
        invited_at: d.invited_at?.toDate?.()?.toISOString() ?? null,
      };
    }),
  ];

  return NextResponse.json({ invites });
}
