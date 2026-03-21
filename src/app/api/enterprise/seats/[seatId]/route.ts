import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { SEAT_STORAGE_TIERS } from "@/lib/enterprise-storage";

/** PATCH - Update a seat's storage allocation (admin only). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ seatId: string }> }
) {
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

  let adminUid: string;
  try {
    const decoded = await verifyIdToken(token);
    adminUid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const { seatId } = await params;
  if (!seatId) {
    return NextResponse.json(
      { error: "Seat ID is required" },
      { status: 400 }
    );
  }

  let body: { storage_quota_bytes?: number | null; role?: "admin" | "member" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(adminUid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;
  const orgRole = profileSnap.data()?.organization_role as string | undefined;

  if (!orgId || orgRole !== "admin") {
    return NextResponse.json(
      { error: "Only organization admins can update seat storage" },
      { status: 403 }
    );
  }

  if (!seatId.startsWith(orgId + "_")) {
    return NextResponse.json(
      { error: "Seat not found" },
      { status: 404 }
    );
  }

  const newRole = body.role;
  if (newRole === "admin" || newRole === "member") {
    const seatSnap = await db.collection("organization_seats").doc(seatId).get();
    if (!seatSnap.exists) {
      return NextResponse.json({ error: "Seat not found" }, { status: 404 });
    }
    const targetUserId = seatSnap.data()?.user_id as string;
    const targetRole = seatSnap.data()?.role as string;
    if (targetRole === newRole) {
      return NextResponse.json({ success: true });
    }
    if (newRole === "member") {
      const adminCount = (
        await db
          .collection("organization_seats")
          .where("organization_id", "==", orgId)
          .where("role", "==", "admin")
          .where("status", "==", "active")
          .get()
      ).docs.length;
      if (adminCount <= 1) {
        return NextResponse.json(
          {
            error:
              "Cannot demote the only admin. Promote another member to admin first, or transfer ownership.",
          },
          { status: 400 }
        );
      }
    }
    if (newRole === "admin") {
      const orgRef = db.collection("organizations").doc(orgId);
      await orgRef.update({ created_by: targetUserId });
    }
    await db.collection("organization_seats").doc(seatId).update({ role: newRole });
    if (targetUserId) {
      await db.collection("profiles").doc(targetUserId).update({
        organization_role: newRole,
      });
    }
    return NextResponse.json({ success: true });
  }

  const newQuota = body.storage_quota_bytes;
  const validTiers = Object.values(SEAT_STORAGE_TIERS);
  const isValid =
    newQuota === null ||
    (typeof newQuota === "number" && validTiers.includes(newQuota as number));

  if (!isValid) {
    return NextResponse.json(
      {
        error:
          "storage_quota_bytes must be 100GB, 500GB, 1TB, 2TB, or null (Unlimited)",
      },
      { status: 400 }
    );
  }

  const seatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .get();

  let allocatedTotal = 0;
  for (const d of seatsSnap.docs) {
    if (d.id === seatId) continue;
    const q = d.data().storage_quota_bytes;
    if (typeof q === "number") allocatedTotal += q;
  }

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgQuota =
    typeof orgSnap.data()?.storage_quota_bytes === "number"
      ? orgSnap.data()!.storage_quota_bytes
      : 16 * 1024 * 1024 * 1024 * 1024;

  const newAllocated =
    newQuota === null ? allocatedTotal : allocatedTotal + newQuota;
  if (newAllocated > orgQuota) {
    const orgTb = (orgQuota / (1024 ** 4)).toFixed(0);
    return NextResponse.json(
      {
        error: `Total allocation would exceed org storage (${orgTb} TB). ${(
          allocatedTotal / (1024 ** 4)
        ).toFixed(1)} TB already allocated.`,
      },
      { status: 400 }
    );
  }

  const seatRef = db.collection("organization_seats").doc(seatId);
  await seatRef.set(
    { storage_quota_bytes: newQuota },
    { merge: true }
  );

  return NextResponse.json({ success: true });
}

/** DELETE - Remove a seat from the organization. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ seatId: string }> }
) {
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

  let adminUid: string;
  try {
    const decoded = await verifyIdToken(token);
    adminUid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const { seatId } = await params;
  if (!seatId) {
    return NextResponse.json(
      { error: "Seat ID is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(adminUid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;
  const orgRole = profileSnap.data()?.organization_role as string | undefined;

  if (!orgId || orgRole !== "admin") {
    return NextResponse.json(
      { error: "Only organization admins can remove seats" },
      { status: 403 }
    );
  }

  if (!seatId.startsWith(orgId + "_")) {
    return NextResponse.json(
      { error: "Seat not found" },
      { status: 404 }
    );
  }

  const adminSeatId = `${orgId}_${adminUid}`;
  if (seatId === adminSeatId) {
    return NextResponse.json(
      { error: "You cannot remove yourself. Leave the organization instead." },
      { status: 400 }
    );
  }

  const seatRef = db.collection("organization_seats").doc(seatId);
  const seatSnap = await seatRef.get();

  if (!seatSnap.exists) {
    return NextResponse.json(
      { error: "Seat not found" },
      { status: 404 }
    );
  }

  const seatData = seatSnap.data()!;
  const removedUserId = seatData.user_id as string | undefined;
  const removedUserEmail = (seatData.email as string | undefined)?.trim() || "unknown";

  // Transfer removed member's files to organization owner
  if (removedUserId && removedUserId.length > 0) {
    const filesSnap = await db
      .collection("backup_files")
      .where("userId", "==", removedUserId)
      .get();

    const filesToTransfer = filesSnap.docs.filter((d) => !d.data().deleted_at);
    if (filesToTransfer.length > 0) {
      const driveIds = [...new Set(filesToTransfer.map((d) => d.data().linked_drive_id as string))];
      const drivesSnap = await Promise.all(
        driveIds.map((id) => db.collection("linked_drives").doc(id).get())
      );
      const driveNameById = new Map<string, string>();
      drivesSnap.forEach((snap, i) => {
        if (snap.exists) {
          const name = snap.data()?.name ?? "Drive";
          driveNameById.set(driveIds[i], name);
        }
      });

      const newDriveRef = await db.collection("linked_drives").add({
        userId: adminUid,
        name: removedUserEmail,
        permission_handle_id: `transferred-${Date.now()}`,
        createdAt: new Date(),
      });
      const newDriveId = newDriveRef.id;

      const BATCH_SIZE = 500;
      for (let i = 0; i < filesToTransfer.length; i += BATCH_SIZE) {
        const chunk = filesToTransfer.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        for (const doc of chunk) {
          const data = doc.data();
          const driveName = driveNameById.get(data.linked_drive_id as string) ?? "Drive";
          const newRelativePath = `${driveName}/${(data.relative_path as string) ?? ""}`.replace(/\/+/g, "/");
          batch.update(doc.ref, {
            userId: adminUid,
            linked_drive_id: newDriveId,
            relative_path: newRelativePath,
          });
        }
        await batch.commit();
      }
    }
  }

  await seatRef.delete();

  if (removedUserId && removedUserId.length > 0) {
    const profileRef = db.collection("profiles").doc(removedUserId);
    await profileRef.set(
      {
        organization_id: FieldValue.delete(),
        organization_role: FieldValue.delete(),
      },
      { merge: true }
    );
  }

  return NextResponse.json({ success: true });
}
