/**
 * PATCH /api/admin/support/[ticketId]
 * Admin only: Update ticket status (open | in_progress | resolved).
 * No-op when status unchanged. Notifications and statusHistory append are best-effort after ticket update.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notification-service";
import {
  isSupportTicketStatus,
  normalizeTicketStatus,
  truncateSupportSubject,
  type SupportTicketStatus,
} from "@/lib/support-ticket";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { ticketId } = await params;
  if (!ticketId) {
    return NextResponse.json({ error: "Missing ticket ID" }, { status: 400 });
  }

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const nextStatus = body.status;
  if (!nextStatus || !isSupportTicketStatus(nextStatus)) {
    return NextResponse.json(
      { error: "status must be one of: open, in_progress, resolved" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const ref = db.collection("support_tickets").doc(ticketId);

  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const data = snap.data()!;
  const prevStatus = normalizeTicketStatus(data.status) as SupportTicketStatus;

  if (prevStatus === nextStatus) {
    return NextResponse.json({
      id: ticketId,
      status: nextStatus,
      noop: true,
      message: "No change",
    });
  }

  const affectedUserId = String(data.affectedUserId ?? "");
  const subject = typeof data.subject === "string" ? data.subject : "";
  const nowIso = new Date().toISOString();
  const historyEntry = {
    status: nextStatus,
    changedAt: nowIso,
    changedBy: auth.uid,
  };

  await ref.update({
    status: nextStatus,
    updatedAt: nowIso,
    statusHistory: FieldValue.arrayUnion(historyEntry),
  });

  const subjectShort = truncateSupportSubject(subject);

  if (nextStatus === "in_progress") {
    try {
      await createNotification({
        recipientUserId: affectedUserId,
        actorUserId: auth.uid,
        type: "support_ticket_in_progress",
        allowSelfActor: true,
        metadata: {
          ticketId,
          supportSubject: subjectShort,
          actorDisplayName: "Support",
        },
      });
    } catch (err) {
      console.error("[admin/support PATCH] in_progress notification failed:", err);
    }
  }

  if (nextStatus === "resolved") {
    try {
      await createNotification({
        recipientUserId: affectedUserId,
        actorUserId: auth.uid,
        type: "support_ticket_resolved",
        allowSelfActor: true,
        metadata: {
          ticketId,
          supportSubject: subjectShort,
          actorDisplayName: "Support",
        },
      });
    } catch (err) {
      console.error("[admin/support PATCH] resolved notification failed:", err);
    }
  }

  return NextResponse.json({
    id: ticketId,
    status: nextStatus,
    message: "Ticket updated",
  });
}
