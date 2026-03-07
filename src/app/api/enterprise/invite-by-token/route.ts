import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

/**
 * GET - Fetch invite details by token. No auth required.
 * Returns org_name, email, organization_id for the invite/join page.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json(
      { error: "Token is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  const seatsSnap = await db
    .collection("organization_seats")
    .where("invite_token", "==", token)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (seatsSnap.empty) {
    return NextResponse.json(
      { error: "Invite not found or already accepted" },
      { status: 404 }
    );
  }

  const seat = seatsSnap.docs[0].data();
  const orgId = seat.organization_id as string;

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgName = orgSnap.exists
    ? (orgSnap.data()?.name as string) ?? "Organization"
    : "Organization";

  return NextResponse.json({
    organization_id: orgId,
    org_name: orgName,
    email: seat.email ?? "",
  });
}
