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

  const pendingSeatData = pendingDocs[0].data();
  const isOrgOwnerInvite = pendingSeatData.role === "admin";
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const currentOrgId = profileSnap.data()?.organization_id as string | undefined;

  if (currentOrgId) {
    if (currentOrgId === orgId) {
      return NextResponse.json(
        { error: "You already belong to this organization" },
        { status: 400 }
      );
    }
    if (isOrgOwnerInvite) {
      const oldSeatId = `${currentOrgId}_${uid}`;
      const oldSeatSnap = await db.collection("organization_seats").doc(oldSeatId).get();
      if (oldSeatSnap.exists) {
        const batch = db.batch();
        batch.delete(oldSeatSnap.ref);
        batch.set(profileSnap.ref, { organization_id: null, organization_role: null }, { merge: true });
        await batch.commit();
      } else {
        await profileSnap.ref.update({ organization_id: null, organization_role: null });
      }
    } else {
      return NextResponse.json(
        { error: "You already belong to another organization. You can only be in one organization at a time." },
        { status: 400 }
      );
    }
  }

  const seatId = `${orgId}_${uid}`;
  const now = FieldValue.serverTimestamp();

  const batch = db.batch();

  for (const docSnap of pendingDocs) {
    batch.delete(docSnap.ref);
  }

  const acceptedRole =
    (pendingSeatData.role === "admin" ? "admin" : "member") as "admin" | "member";
  const seatRef = db.collection("organization_seats").doc(seatId);
  batch.set(seatRef, {
    organization_id: orgId,
    user_id: uid,
    role: acceptedRole,
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
      organization_role: acceptedRole,
    },
    { merge: true }
  );

  await batch.commit();

  return NextResponse.json({
    success: true,
    organization_id: orgId,
  });
}
