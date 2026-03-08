import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { findPendingSeatByToken } from "@/lib/invite-lookup";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

/** POST - Accept a pending invite to join an organization. */
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
  let email: string | undefined;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  let body: { organization_id?: string; invite_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const inviteToken = typeof body.invite_token === "string" ? body.invite_token.trim() : "";
  const orgIdParam = typeof body.organization_id === "string" ? body.organization_id.trim() : "";

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  if (profileSnap.data()?.organization_id) {
    return NextResponse.json(
      { error: "You already belong to an organization" },
      { status: 400 }
    );
  }

  let orgId: string;
  let pendingDocs: QueryDocumentSnapshot[];

  if (inviteToken) {
    const pendingSeat = await findPendingSeatByToken(db, inviteToken);

    if (pendingSeat) {
      const seatData = pendingSeat.data();
      const inviteEmail = (seatData.email as string)?.toLowerCase() ?? "";
      if (inviteEmail && email?.toLowerCase() !== inviteEmail) {
        return NextResponse.json(
          { error: "This invite was sent to a different email address" },
          { status: 403 }
        );
      }
      orgId = seatData.organization_id as string;
      pendingDocs = [pendingSeat];
    } else if (orgIdParam && email) {
      const emailSnap = await db
        .collection("organization_seats")
        .where("organization_id", "==", orgIdParam)
        .where("email", "==", email.toLowerCase())
        .where("status", "==", "pending")
        .get();
      if (!emailSnap.empty) {
        orgId = orgIdParam;
        pendingDocs = emailSnap.docs;
      } else {
        return NextResponse.json(
          { error: "Invite not found or already accepted" },
          { status: 404 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Invite not found or already accepted" },
        { status: 404 }
      );
    }
  } else if (orgIdParam) {
    orgId = orgIdParam;
    const orgSnap = await db
      .collection("organization_seats")
      .where("organization_id", "==", orgId)
      .where("email", "==", (email ?? "").toLowerCase())
      .where("status", "==", "pending")
      .get();
    pendingDocs = orgSnap.docs;
  } else {
    return NextResponse.json(
      { error: "organization_id or invite_token is required" },
      { status: 400 }
    );
  }

  if (pendingDocs.length === 0) {
    return NextResponse.json(
      { error: "No pending invite found for this organization" },
      { status: 404 }
    );
  }

  const seatId = `${orgId}_${uid}`;
  const now = FieldValue.serverTimestamp();

  const batch = db.batch();

  for (const docSnap of pendingDocs) {
    batch.delete(docSnap.ref);
  }

  const pendingSeatData = pendingDocs[0].data();
  const seatRef = db.collection("organization_seats").doc(seatId);
  batch.set(seatRef, {
    organization_id: orgId,
    user_id: uid,
    role: "member",
    email: email ?? "",
    display_name: null,
    invited_at: now,
    accepted_at: now,
    status: "active",
    storage_quota_bytes:
      typeof pendingSeatData.storage_quota_bytes === "number" ||
      pendingSeatData.storage_quota_bytes === null
        ? pendingSeatData.storage_quota_bytes
        : 1024 * 1024 * 1024 * 1024,
  });

  const profileRef = db.collection("profiles").doc(uid);
  batch.set(
    profileRef,
    {
      organization_id: orgId,
      organization_role: "member",
    },
    { merge: true }
  );

  await batch.commit();

  return NextResponse.json({
    success: true,
    organization_id: orgId,
  });
}
