import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { hashInviteToken } from "@/lib/invite-token";
import { sendOrgSeatInviteEmail } from "@/lib/emailjs";
import { createOrgSeatInviteNotification } from "@/lib/notification-service";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-storage";

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
  const maxSeats = org?.max_seats;

  if (typeof maxSeats !== "number" || maxSeats < 1) {
    return NextResponse.json(
      { error: "Organization seat limit not set. Contact sales to add seats." },
      { status: 400 }
    );
  }

  const existingSeatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .get();

  if (existingSeatsSnap.size >= maxSeats) {
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

  const inviteToken = crypto.randomUUID();
  const inviteTokenHash = hashInviteToken(inviteToken);
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
    invite_token_hash: inviteTokenHash,
    storage_quota_bytes: DEFAULT_SEAT_STORAGE_BYTES,
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    "https://www.bizzicloud.io";
  const inviteLink = `${baseUrl}/invite/join?token=${inviteToken}`;

  const orgName = (org?.name as string) ?? "Organization";
  const profileData = profileSnap.data();
  const actorDisplayName =
    (profileData?.display_name as string)?.trim() ??
    (profileData?.displayName as string)?.trim() ??
    inviterEmail?.split("@")[0] ??
    "An organization admin";

  try {
    await sendOrgSeatInviteEmail({
      to_email: email,
      org_name: orgName,
      invite_url: inviteLink,
    });
  } catch (err) {
    console.error("[enterprise/invite] EmailJS org seat invite failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Invite created but failed to send email. Check EMAILJS_TEMPLATE_ID_ORG_SEAT_INVITE configuration.",
      },
      { status: 500 }
    );
  }

  // In-app notification for invitees who already have a BizziCloud account
  createOrgSeatInviteNotification({
    inviteeEmail: email,
    invitedByUserId: uid,
    actorDisplayName,
    orgId,
    orgName,
    inviteToken,
  }).catch((err) => {
    console.error("[enterprise/invite] In-app notification failed:", err);
  });

  return NextResponse.json({
    success: true,
    email,
    invite_token: inviteToken,
    invite_link: inviteLink,
    message:
      "Invite sent via email. The user will receive the invite link and can accept it when logged in or sign up with their invited email.",
  });
}
