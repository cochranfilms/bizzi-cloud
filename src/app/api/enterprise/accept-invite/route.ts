import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

/** POST - Accept a pending invite to join an organization. */
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

  let body: { organization_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const orgId = typeof body.organization_id === "string" ? body.organization_id.trim() : "";
  if (!orgId) {
    return NextResponse.json(
      { error: "organization_id is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  if (profileSnap.data()?.organization_id) {
    return NextResponse.json(
      { error: "You already belong to an organization" },
      { status: 400 }
    );
  }

  const pendingSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("email", "==", (email ?? "").toLowerCase())
    .where("status", "==", "pending")
    .get();

  if (pendingSnap.empty) {
    return NextResponse.json(
      { error: "No pending invite found for this organization" },
      { status: 404 }
    );
  }

  const seatId = `${orgId}_${uid}`;
  const now = FieldValue.serverTimestamp();

  const batch = db.batch();

  for (const docSnap of pendingSnap.docs) {
    batch.delete(docSnap.ref);
  }

  const seatRef = db.collection("organization_seats").doc(seatId);
  batch.set(seatRef, {
    organization_id: orgId,
    user_id: uid,
    role: "member",
    email: email ?? "",
    display_name: null,
    invited_at: now,
    accepted_at: now,
    status: "active",
  });

  const profileRef = db.collection("profiles").doc(uid);
  batch.set(
    profileRef,
    {
      organization_id: orgId,
      organization_role: "member",
    },
    { merge: true }
  );

  await batch.commit();

  return NextResponse.json({
    success: true,
    organization_id: orgId,
  });
}
