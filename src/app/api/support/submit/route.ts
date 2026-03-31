/**
 * POST /api/support/submit
 * User-facing: Submit a support ticket. Creates Firestore doc; emails and notifications are best-effort.
 */
import { getAdminFirestore, getAdminAuth, verifyIdToken } from "@/lib/firebase-admin";
import {
  sendSupportTicketEmail,
  sendSupportTicketConfirmationEmail,
} from "@/lib/emailjs";
import { createNotification } from "@/lib/notification-service";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  SUPPORT_CONTACT_EMAIL,
  SUPPORT_SUBMIT_RATE_LIMIT_MAX,
  SUPPORT_SUBMIT_RATE_LIMIT_WINDOW_MS,
  parseSupportSubmitBody,
  truncateSupportSubject,
} from "@/lib/support-ticket";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  let email: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = (decoded.email as string | undefined) ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const rl = checkRateLimit(
    `support_submit:${uid}`,
    SUPPORT_SUBMIT_RATE_LIMIT_MAX,
    SUPPORT_SUBMIT_RATE_LIMIT_WINDOW_MS
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many support requests. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseSupportSubmitBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { subject, message, issueType } = parsed.data;

  try {
    const authUser = await getAdminAuth().getUser(uid);
    const userEmail = authUser.email ?? email;
    const userName = authUser.displayName ?? userEmail.split("@")[0] ?? "User";

    const db = getAdminFirestore();
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const createdAtFormatted = nowDate.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const docRef = await db.collection("support_tickets").add({
      subject,
      message,
      issueType,
      status: "open",
      affectedUserId: uid,
      affectedUserEmail: userEmail,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await sendSupportTicketEmail({
        subject,
        message,
        user_email: userEmail,
        user_name: userName,
        user_id: uid,
        issue_type: issueType,
        created_at: now,
        created_at_formatted: createdAtFormatted,
      });
    } catch (err) {
      console.error("[support/submit] ops EmailJS failed:", err);
    }

    try {
      await sendSupportTicketConfirmationEmail({
        to_email: userEmail,
        ticket_id: docRef.id,
        ticket_subject: subject,
        ticket_message: message,
        issue_type: issueType,
        submitted_at: createdAtFormatted,
        support_email: SUPPORT_CONTACT_EMAIL,
      });
    } catch (err) {
      console.error("[support/submit] user confirmation EmailJS failed:", err);
    }

    const subjectShort = truncateSupportSubject(subject);
    try {
      await createNotification({
        recipientUserId: uid,
        actorUserId: uid,
        type: "support_ticket_submitted",
        allowSelfActor: true,
        metadata: {
          ticketId: docRef.id,
          supportSubject: subjectShort,
          actorDisplayName: "Support",
        },
      });
    } catch (err) {
      console.error("[support/submit] notification failed:", err);
    }

    return NextResponse.json({
      id: docRef.id,
      message:
        "Support ticket submitted successfully. We have received your request and are working on it.",
    });
  } catch (err) {
    console.error("[support/submit]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit ticket" },
      { status: 500 }
    );
  }
}
