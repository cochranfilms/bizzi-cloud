import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { checkInviteRateLimit } from "@/lib/enterprise-invite-rate-limit";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { NextResponse } from "next/server";

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

  const pendingSnap = await db
    .collection("organization_seats")
    .where("email", "==", email.toLowerCase())
    .where("status", "==", "pending")
    .get();

  const invites = await Promise.all(
    pendingSnap.docs.map(async (docSnap) => {
      const d = docSnap.data();
      const orgId = d.organization_id as string;
      const orgSnap = await db.collection("organizations").doc(orgId).get();
      const orgName = orgSnap.exists ? (orgSnap.data()?.name as string) ?? "" : "";
      return {
        seat_id: docSnap.id,
        organization_id: orgId,
        organization_name: orgName,
        email: d.email,
        invited_at: d.invited_at?.toDate?.()?.toISOString() ?? null,
      };
    })
  );

  return NextResponse.json({ invites });
}
