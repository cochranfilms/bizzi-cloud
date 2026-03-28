import { verifyIdToken } from "@/lib/firebase-admin";
import {
  commitReservation,
  getReservationDoc,
} from "@/lib/storage-quota-reservations";
import { NextResponse } from "next/server";

/** POST — Mark reservation committed after client finalized Firestore (desktop sync path). */
export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: { reservation_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reservation_id =
    typeof body.reservation_id === "string" ? body.reservation_id.trim() : "";
  if (!reservation_id) {
    return NextResponse.json({ error: "reservation_id required" }, { status: 400 });
  }

  const row = await getReservationDoc(reservation_id);
  if (!row) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }
  const d = row.data;
  if (d.requesting_user_id !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (d.status !== "pending") {
    return NextResponse.json({ error: "Reservation is not pending" }, { status: 400 });
  }

  await commitReservation(reservation_id);
  return NextResponse.json({ ok: true });
}
