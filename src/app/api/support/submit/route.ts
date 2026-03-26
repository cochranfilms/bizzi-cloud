/**
 * POST /api/support/submit
 * User-facing: Submit a support ticket. Creates Firestore doc and sends EmailJS to support inbox.
 */
import { getAdminFirestore, getAdminAuth, verifyIdToken } from "@/lib/firebase-admin";
import { sendSupportTicketEmail } from "@/lib/emailjs";
import { createNotification } from "@/lib/notification-service";
import { NextResponse } from "next/server";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const ISSUE_TYPES = ["billing", "upload", "storage", "account", "preview", "other"] as const;

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

  let body: { subject?: string; message?: string; priority?: string; issueType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const priority: string = PRIORITIES.includes(body.priority as (typeof PRIORITIES)[number])
    ? (body.priority as string)
    : "medium";
  const issueType: string = ISSUE_TYPES.includes(body.issueType as (typeof ISSUE_TYPES)[number])
    ? (body.issueType as string)
    : "other";

  if (!subject || subject.length < 3) {
    return NextResponse.json({ error: "Subject must be at least 3 characters" }, { status: 400 });
  }
  if (!message || message.length < 10) {
    return NextResponse.json({ error: "Message must be at least 10 characters" }, { status: 400 });
  }

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
      priority,
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
        priority,
        issue_type: issueType,
        created_at: now,
        created_at_formatted: createdAtFormatted,
      });
    } catch (err) {
      console.error("[support/submit] EmailJS failed:", err);
      // Ticket is saved; email failure is non-fatal
    }

    const subjectShort = subject.length > 80 ? `${subject.slice(0, 77)}…` : subject;
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
    }).catch((err) => console.error("[support/submit] notification:", err));

    return NextResponse.json({
      id: docRef.id,
      message: "Support ticket submitted successfully. We'll get back to you soon.",
    });
  } catch (err) {
    console.error("[support/submit]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit ticket" },
      { status: 500 }
    );
  }
}
