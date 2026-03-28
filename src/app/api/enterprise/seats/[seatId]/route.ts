import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-storage";
import { isProductSeatTierByte } from "@/lib/enterprise-constants";
import { seatNumericCapForEnforcement } from "@/lib/org-seat-quota";
import { syncOrganizationSeatAllocationSummary } from "@/lib/org-seat-allocation-summary";
import {
  createNotification,
  formatStorageQuotaSummary,
  getActorDisplayName,
} from "@/lib/notification-service";

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

  if (!orgId) {
    return NextResponse.json(
      { error: "Only organization admins can update seat storage" },
      { status: 403 }
    );
  }

  const adminAccess = await resolveEnterpriseAccess(adminUid, orgId);
  if (!adminAccess.isAdmin) {
    logEnterpriseSecurityEvent("enterprise_admin_denied", {
      uid: adminUid,
      orgId,
      route: "enterprise/seats PATCH",
    });
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
    const prevBytes = seatSnap.data()?.storage_quota_bytes;
    const quotaUpdate =
      newRole === "admin"
        ? { role: newRole, quota_mode: "org_unlimited", storage_quota_bytes: null }
        : {
            role: newRole,
            quota_mode: "fixed",
            storage_quota_bytes:
              typeof prevBytes === "number" ? prevBytes : DEFAULT_SEAT_STORAGE_BYTES,
          };
    await db.collection("organization_seats").doc(seatId).update(quotaUpdate);
    logEnterpriseSecurityEvent("seat_role_changed", {
      orgId,
      actorUid: adminUid,
      seatId,
      targetUserId: targetUserId ?? null,
      previousRole: targetRole,
      newRole,
    });
    if (targetUserId) {
      await db.collection("profiles").doc(targetUserId).update({
        organization_role: newRole,
      });
    }
    if (targetUserId && targetUserId !== adminUid) {
      const orgSnap = await db.collection("organizations").doc(orgId).get();
      const orgName = (orgSnap.data()?.name as string) ?? "Organization";
      const adminLabel = await getActorDisplayName(db, adminUid);
      await createNotification({
        recipientUserId: targetUserId,
        actorUserId: adminUid,
        type: "org_role_changed",
        metadata: {
          actorDisplayName: adminLabel,
          orgName,
          orgId,
          newRole,
        },
      }).catch((err) => console.error("[enterprise/seats PATCH role] notification:", err));
    }
    await syncOrganizationSeatAllocationSummary(db, orgId);
    return NextResponse.json({ success: true });
  }

  const newQuota = body.storage_quota_bytes;
  const isValid =
    newQuota === null ||
    (typeof newQuota === "number" && isProductSeatTierByte(newQuota));

  if (!isValid) {
    return NextResponse.json(
      {
        error:
          "storage_quota_bytes must be a supported tier (50GB–10TB) or null (Unlimited within org pool)",
      },
      { status: 400 }
    );
  }

  const seatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("status", "==", "active")
    .get();

  let allocatedTotal = 0;
  for (const d of seatsSnap.docs) {
    if (d.id === seatId) continue;
    const cap = seatNumericCapForEnforcement(d.data() as Record<string, unknown>);
    if (typeof cap === "number") allocatedTotal += cap;
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
        error: `Total fixed seat allocation would exceed the organization pool (${orgTb} TB). ${(
          allocatedTotal / (1024 ** 4)
        ).toFixed(1)} TB already allocated to other members.`,
      },
      { status: 400 }
    );
  }

  const seatRef = db.collection("organization_seats").doc(seatId);
  const seatBefore = await seatRef.get();
  const seatUserId = seatBefore.data()?.user_id as string | undefined;
  const prevQuota = seatBefore.data()?.storage_quota_bytes as number | null | undefined;
  const quota_mode = newQuota === null ? "org_unlimited" : "fixed";
  await seatRef.set(
    { storage_quota_bytes: newQuota, quota_mode },
    { merge: true }
  );

  logEnterpriseSecurityEvent("seat_storage_quota_changed", {
    orgId,
    actorUid: adminUid,
    seatId,
    targetUserId: seatUserId ?? null,
    previous_storage_quota_bytes: prevQuota ?? null,
    new_storage_quota_bytes: newQuota,
    quota_mode,
  });

  await syncOrganizationSeatAllocationSummary(db, orgId);

  if (seatUserId && seatUserId !== adminUid) {
    const orgName = (orgSnap.data()?.name as string) ?? "Organization";
    const adminLabel = await getActorDisplayName(db, adminUid);
    await createNotification({
      recipientUserId: seatUserId,
      actorUserId: adminUid,
      type: "org_storage_quota_changed",
      metadata: {
        actorDisplayName: adminLabel,
        orgName,
        orgId,
        storageQuotaSummary: formatStorageQuotaSummary(newQuota),
      },
    }).catch((err) => console.error("[enterprise/seats PATCH storage] notification:", err));
  }

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

  if (!orgId) {
    return NextResponse.json(
      { error: "Only organization admins can remove seats" },
      { status: 403 }
    );
  }

  const deleteAdminAccess = await resolveEnterpriseAccess(adminUid, orgId);
  if (!deleteAdminAccess.isAdmin) {
    logEnterpriseSecurityEvent("enterprise_admin_denied", {
      uid: adminUid,
      orgId,
      route: "enterprise/seats DELETE",
    });
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

  // Seat removal: revoke access only. Do NOT cold store or transfer org workspace files.
  // Update workspace membership so removed user loses access.
  if (removedUserId) {
    const workspacesSnap = await db
      .collection("workspaces")
      .where("organization_id", "==", orgId)
      .get();

    for (const wsDoc of workspacesSnap.docs) {
      const data = wsDoc.data();
      const createdBy = data.created_by as string | undefined;
      const memberIds = (data.member_user_ids as string[] | undefined) ?? [];
      const needsUpdate =
        createdBy === removedUserId || memberIds.includes(removedUserId);

      if (needsUpdate) {
        const updates: Record<string, unknown> = {};
        if (createdBy === removedUserId) {
          updates.created_by = adminUid;
        }
        let newMembers = memberIds.filter((id) => id !== removedUserId);
        if (createdBy === removedUserId && !newMembers.includes(adminUid)) {
          newMembers = [...newMembers, adminUid];
        }
        updates.member_user_ids = newMembers;
        await wsDoc.ref.update(updates);
      }
    }
  }

  await seatRef.delete();

  await syncOrganizationSeatAllocationSummary(db, orgId);

  logEnterpriseSecurityEvent("seat_removed", {
    orgId,
    actorUid: adminUid,
    seatId,
    removedUserId: removedUserId ?? null,
  });

  if (removedUserId && removedUserId.length > 0) {
    const profileRef = db.collection("profiles").doc(removedUserId);
    await profileRef.set(
      {
        organization_id: FieldValue.delete(),
        organization_role: FieldValue.delete(),
      },
      { merge: true }
    );
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgName = (orgSnap.data()?.name as string) ?? "Organization";
    const adminLabel = await getActorDisplayName(db, adminUid);
    await createNotification({
      recipientUserId: removedUserId,
      actorUserId: adminUid,
      type: "org_you_were_removed",
      metadata: {
        actorDisplayName: adminLabel,
        orgName,
        orgId,
      },
    }).catch((err) => console.error("[enterprise/seats DELETE] notification:", err));
  }

  return NextResponse.json({ success: true });
}
