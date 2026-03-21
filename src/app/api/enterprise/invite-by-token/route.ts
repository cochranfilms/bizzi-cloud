import { getAdminFirestore } from "@/lib/firebase-admin";
import { findPendingSeatByToken } from "@/lib/invite-lookup";
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
  const pendingSeat = await findPendingSeatByToken(db, token);

  if (!pendingSeat) {
    return NextResponse.json(
      { error: "Invite not found or already accepted" },
      { status: 404 }
    );
  }

  const seat = pendingSeat.data();
  const orgId = seat.organization_id as string;

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgName = orgSnap.exists
    ? (orgSnap.data()?.name as string) ?? "Organization"
    : "Organization";

  return NextResponse.json({
    organization_id: orgId,
    org_name: orgName,
    email: seat.email ?? "",
    role: (seat.role as string) ?? "member",
  });
}
