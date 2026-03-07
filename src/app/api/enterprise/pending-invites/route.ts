import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
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
