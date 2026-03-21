/**
 * PATCH /api/admin/support/[ticketId]
 * Admin only: Update ticket status (open | in_progress | resolved).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

const VALID_STATUSES = ["open", "in_progress", "resolved"] as const;

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

  const status = body.status;
  if (!status || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
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

  await ref.update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    id: ticketId,
    status,
    message: "Ticket updated",
  });
}
