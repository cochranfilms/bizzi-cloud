/**
 * POST /api/admin/enterprise/create-org
 * Admin-only: Create an organization and send invite to org owner.
 * Returns org_id and invite_link for admin to copy and send to customer.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { hashInviteToken } from "@/lib/invite-token";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { EnterpriseThemeId } from "@/types/enterprise";
import {
  ENTERPRISE_ORG_STORAGE_BYTES,
  DEFAULT_SEAT_STORAGE_BYTES,
} from "@/lib/enterprise-storage";

export async function POST(request: Request) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  let body: {
    org_name?: string;
    owner_email?: string;
    max_seats?: number;
    storage_quota_bytes?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const orgName =
    typeof body.org_name === "string" ? body.org_name.trim() : "";
  const ownerEmail =
    typeof body.owner_email === "string"
      ? body.owner_email.trim().toLowerCase()
      : "";

  if (!orgName || orgName.length < 2) {
    return NextResponse.json(
      { error: "Organization name must be at least 2 characters" },
      { status: 400 }
    );
  }

  if (!ownerEmail || !ownerEmail.includes("@")) {
    return NextResponse.json(
      { error: "Valid owner email is required" },
      { status: 400 }
    );
  }

  const maxSeats =
    typeof body.max_seats === "number" && body.max_seats >= 1
      ? Math.floor(body.max_seats)
      : null;
  if (maxSeats === null) {
    return NextResponse.json(
      { error: "max_seats is required and must be at least 1" },
      { status: 400 }
    );
  }
  const storageQuotaBytes =
    typeof body.storage_quota_bytes === "number" && body.storage_quota_bytes > 0
      ? body.storage_quota_bytes
      : ENTERPRISE_ORG_STORAGE_BYTES;

  const db = getAdminFirestore();

  const inviteToken = crypto.randomUUID();
  const inviteTokenHash = hashInviteToken(inviteToken);
  const pendingId = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = FieldValue.serverTimestamp();

  const orgRef = db.collection("organizations").doc();
  const orgId = orgRef.id;

  await orgRef.set({
    name: orgName,
    theme: "bizzi" as EnterpriseThemeId,
    storage_quota_bytes: storageQuotaBytes,
    storage_used_bytes: 0,
    created_at: now,
    created_by: authResult.uid,
    max_seats: maxSeats,
  });

  await db.collection("organization_seats").doc(pendingId).set({
    organization_id: orgId,
    user_id: "",
    role: "admin",
    email: ownerEmail,
    display_name: null,
    invited_at: now,
    accepted_at: null,
    status: "pending",
    invited_by: authResult.uid,
    invite_token_hash: inviteTokenHash,
    storage_quota_bytes: DEFAULT_SEAT_STORAGE_BYTES,
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    request.headers.get("origin") ??
    "http://localhost:3000";

  const inviteLink = `${baseUrl}/invite/join?token=${inviteToken}`;

  return NextResponse.json({
    organization_id: orgId,
    org_name: orgName,
    owner_email: ownerEmail,
    invite_link: inviteLink,
    invite_token: inviteToken,
  });
}
