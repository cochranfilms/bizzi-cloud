import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

/** DELETE - Remove a seat from the organization. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ seatId: string }> }
) {
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

  let adminUid: string;
  try {
    const decoded = await verifyIdToken(token);
    adminUid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const { seatId } = await params;
  if (!seatId) {
    return NextResponse.json(
      { error: "Seat ID is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(adminUid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;
  const orgRole = profileSnap.data()?.organization_role as string | undefined;

  if (!orgId || orgRole !== "admin") {
    return NextResponse.json(
      { error: "Only organization admins can remove seats" },
      { status: 403 }
    );
  }

  if (!seatId.startsWith(orgId + "_")) {
    return NextResponse.json(
      { error: "Seat not found" },
      { status: 404 }
    );
  }

  const adminSeatId = `${orgId}_${adminUid}`;
  if (seatId === adminSeatId) {
    return NextResponse.json(
      { error: "You cannot remove yourself. Leave the organization instead." },
      { status: 400 }
    );
  }

  const seatRef = db.collection("organization_seats").doc(seatId);
  const seatSnap = await seatRef.get();

  if (!seatSnap.exists) {
    return NextResponse.json(
      { error: "Seat not found" },
      { status: 404 }
    );
  }

  const seatData = seatSnap.data()!;
  const userId = seatData.user_id as string | undefined;

  await seatRef.delete();

  if (userId && userId.length > 0) {
    const profileRef = db.collection("profiles").doc(userId);
    await profileRef.set(
      {
        organization_id: FieldValue.delete(),
        organization_role: FieldValue.delete(),
      },
      { merge: true }
    );
  }

  return NextResponse.json({ success: true });
}
