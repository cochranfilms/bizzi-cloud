/**
 * POST /api/galleries/[id]/send-invite
 * Sends the gallery invite email and in-app notification to a single invited email.
 * Requires the email to already be in the gallery's invited_emails list.
 * Records the email in invite_sent_to so the UI can show "Invited" status.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  sendGalleryInviteEmailsToInvitees,
} from "@/lib/emailjs";
import { createGalleryInviteNotifications } from "@/lib/notification-service";
import { NextResponse } from "next/server";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";

async function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;
  const { id: galleryId } = await params;

  if (!galleryId)
    return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email)
    return NextResponse.json({ error: "email is required" }, { status: 400 });

  const db = getAdminFirestore();
  const snap = await db.collection("galleries").doc(galleryId).get();
  if (!snap.exists)
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const data = snap.data()!;
  if (!(await userCanManageGalleryAsPhotographer(uid, data)))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const invitedEmails = (data.invited_emails ?? []) as string[];
  if (!invitedEmails.includes(email))
    return NextResponse.json(
      { error: "Email must be saved to the invited list first. Save settings, then send invite." },
      { status: 400 }
    );

  let photographerDisplayName = "A photographer";
  try {
    const authUser = await getAdminAuth().getUser(uid);
    photographerDisplayName =
      authUser.displayName || authUser.email || photographerDisplayName;
  } catch {
    // keep fallback
  }

  const title = (data.title ?? "Gallery") as string;
  const eventDate = (data.event_date as string | null) ?? null;

  try {
    await sendGalleryInviteEmailsToInvitees({
      invitedEmails: [email],
      photographerUserId: uid,
      photographerDisplayName,
      galleryTitle: title,
      galleryId,
      eventDate,
    });
  } catch (err) {
    console.error("[galleries/send-invite] Email error:", err);
    return NextResponse.json(
      { error: "Failed to send invite email. Please try again." },
      { status: 500 }
    );
  }

  try {
    await createGalleryInviteNotifications({
      photographerUserId: uid,
      photographerDisplayName,
      galleryId,
      galleryTitle: title,
      invitedEmails: [email],
    });
  } catch (err) {
    console.error("[galleries/send-invite] Notification error:", err);
    // Don't fail the request - email was sent, notification is best-effort
  }

  // Record that this email has been sent an invite (for "Invited" status in UI)
  try {
    await db.collection("galleries").doc(galleryId).update({
      invite_sent_to: FieldValue.arrayUnion(email),
      updated_at: new Date(),
    });
  } catch (err) {
    console.error("[galleries/send-invite] Failed to update invite_sent_to:", err);
    // Don't fail - invite was sent successfully
  }

  return NextResponse.json({ ok: true });
}
