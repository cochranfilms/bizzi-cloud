/**
 * Cron: notify recipients when a transfer expires within the next 24 hours (once per transfer).
 * Requires CRON_SECRET when set (same as other crons).
 */
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { createNotification, getActorDisplayName } from "@/lib/notification-service";
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = getAdminFirestore();
  const now = new Date();
  const soon = new Date(now.getTime() + WINDOW_MS);
  const snap = await db.collection("transfers").where("status", "==", "active").limit(500).get();

  let notified = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.expiry_warning_sent === true) continue;
    const rawExp = data.expires_at;
    if (!rawExp || typeof rawExp !== "string") continue;
    const exp = new Date(rawExp);
    if (Number.isNaN(exp.getTime()) || exp <= now || exp > soon) continue;

    const clientEmail =
      typeof data.clientEmail === "string"
        ? data.clientEmail.trim()
        : typeof data.client_email === "string"
          ? data.client_email.trim()
          : "";
    if (!clientEmail) continue;

    const ownerUid =
      (typeof data.user_id === "string" && data.user_id) ||
      (typeof data.userId === "string" && data.userId) ||
      "";
    if (!ownerUid) continue;

    let recipientUid: string | null = null;
    try {
      const r = await getAdminAuth().getUserByEmail(clientEmail.toLowerCase());
      if (r.uid && r.uid !== ownerUid) recipientUid = r.uid;
    } catch {
      continue;
    }
    if (!recipientUid) continue;

    const transferName = (data.name as string) ?? "Transfer";
    const senderLabel = await getActorDisplayName(db, ownerUid);
    await createNotification({
      recipientUserId: recipientUid,
      actorUserId: ownerUid,
      type: "transfer_expiring_soon",
      metadata: {
        actorDisplayName: senderLabel,
        transferSlug: doc.id,
        transferName,
      },
    }).catch((err) => console.error("[transfer-expiry-warnings] notify:", doc.id, err));

    await doc.ref.update({ expiry_warning_sent: true }).catch((err) =>
      console.error("[transfer-expiry-warnings] update:", doc.id, err)
    );
    notified++;
  }

  return NextResponse.json({ notified });
}
