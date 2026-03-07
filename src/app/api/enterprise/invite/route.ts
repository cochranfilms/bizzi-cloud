import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

/** POST - Invite a user to the organization by email. */
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
  let inviterEmail: string | undefined;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    inviterEmail = decoded.email;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string"
    ? body.email.trim().toLowerCase()
    : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;
  const orgRole = profileSnap.data()?.organization_role as string | undefined;

  if (!orgId || orgRole !== "admin") {
    return NextResponse.json(
      { error: "Only organization admins can invite members" },
      { status: 403 }
    );
  }

  const seatId = `${orgId}_${uid}`;
  const seatSnap = await db.collection("organization_seats").doc(seatId).get();
  if (!seatSnap.exists || seatSnap.data()?.role !== "admin") {
    return NextResponse.json(
      { error: "Only organization admins can invite members" },
      { status: 403 }
    );
  }

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const org = orgSnap.data();
  const maxSeats = org?.max_seats as number | undefined;

  const existingSeatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .get();

  if (
    typeof maxSeats === "number" &&
    existingSeatsSnap.size >= maxSeats
  ) {
    return NextResponse.json(
      { error: "Organization has reached its seat limit" },
      { status: 400 }
    );
  }

  const existingByEmail = existingSeatsSnap.docs.find(
    (d) => (d.data().email as string)?.toLowerCase() === email
  );
  if (existingByEmail) {
    return NextResponse.json(
      { error: "This email is already invited or a member" },
      { status: 400 }
    );
  }

  if (inviterEmail?.toLowerCase() === email) {
    return NextResponse.json(
      { error: "You cannot invite yourself" },
      { status: 400 }
    );
  }

  const pendingId = `${orgId}_invite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = FieldValue.serverTimestamp();

  await db.collection("organization_seats").doc(pendingId).set({
    organization_id: orgId,
    user_id: "",
    role: "member",
    email,
    display_name: null,
    invited_at: now,
    accepted_at: null,
    status: "pending",
    invited_by: uid,
  });

  return NextResponse.json({
    success: true,
    email,
    message:
      "Invite sent. The user will see the invite when they log in with this email.",
  });
}
