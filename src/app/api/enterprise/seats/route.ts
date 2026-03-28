import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { sumActiveUserOrgBackupBytes } from "@/lib/backup-file-storage-bytes";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { NextResponse } from "next/server";
import {
  ORGANIZATION_INVITES_COLLECTION,
} from "@/lib/organization-invites";

/** GET - List active seats; admins also get pending invites + allocation summary. */
export async function GET(request: Request) {
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
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;
  if (!orgId) {
    return NextResponse.json(
      { error: "You are not in an organization" },
      { status: 403 }
    );
  }

  const access = await resolveEnterpriseAccess(uid, orgId);
  if (!access.canAccessEnterprise) {
    return NextResponse.json(
      { error: "Not a member of this organization" },
      { status: 403 }
    );
  }

  const seatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("status", "==", "active")
    .get();

  const seats = await Promise.all(
    seatsSnap.docs.map(async (doc) => {
      const d = doc.data();
      const userId = d.user_id as string | undefined;
      let storage_used_bytes = 0;
      if (userId && userId.length > 0) {
        storage_used_bytes = await sumActiveUserOrgBackupBytes(db, userId, orgId);
      }
      return {
        id: doc.id,
        organization_id: d.organization_id,
        user_id: d.user_id,
        role: d.role,
        email: d.email,
        display_name: d.display_name ?? null,
        status: d.status,
        quota_mode: (d.quota_mode as string | undefined) ?? undefined,
        invited_at: d.invited_at?.toDate?.()?.toISOString() ?? null,
        accepted_at: d.accepted_at?.toDate?.()?.toISOString() ?? null,
        storage_quota_bytes: d.storage_quota_bytes ?? null,
        storage_used_bytes,
      };
    })
  );

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgData = orgSnap.data();

  let allocation_summary:
    | {
        org_quota_bytes: number | null;
        org_used_bytes: number | null;
        numeric_allocated_seat_bytes: number | null;
        active_seat_count: number;
        fixed_quota_seat_count: number | null;
        unlimited_seat_count: number | null;
        remaining_numeric_allocatable_bytes: number | null;
      }
    | undefined;
  let pending_invites:
    | Array<{
        id: string;
        email: string;
        role: string;
        invited_at: string | null;
        source: "organization_invites" | "legacy_organization_seats";
      }>
    | undefined;

  if (access.isAdmin) {
    const orgQuota =
      typeof orgData?.storage_quota_bytes === "number"
        ? orgData.storage_quota_bytes
        : null;
    const numericAlloc =
      typeof orgData?.numeric_allocated_seat_bytes === "number"
        ? orgData.numeric_allocated_seat_bytes
        : null;
    allocation_summary = {
      org_quota_bytes: orgQuota,
      org_used_bytes:
        typeof orgData?.storage_used_bytes === "number"
          ? orgData.storage_used_bytes
          : null,
      numeric_allocated_seat_bytes: numericAlloc,
      active_seat_count: seatsSnap.size,
      fixed_quota_seat_count:
        typeof orgData?.fixed_quota_seat_count === "number"
          ? orgData.fixed_quota_seat_count
          : null,
      unlimited_seat_count:
        typeof orgData?.unlimited_seat_count === "number"
          ? orgData.unlimited_seat_count
          : null,
      remaining_numeric_allocatable_bytes:
        orgQuota !== null && numericAlloc !== null
          ? Math.max(0, orgQuota - numericAlloc)
          : null,
    };

    const [invSnap, legacyPendingSnap] = await Promise.all([
      db
        .collection(ORGANIZATION_INVITES_COLLECTION)
        .where("organization_id", "==", orgId)
        .where("status", "==", "pending")
        .get(),
      db
        .collection("organization_seats")
        .where("organization_id", "==", orgId)
        .where("status", "==", "pending")
        .get(),
    ]);

    pending_invites = [
      ...invSnap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          email: (d.email as string) ?? "",
          role: (d.role as string) ?? "member",
          invited_at: d.invited_at?.toDate?.()?.toISOString() ?? null,
          source: "organization_invites" as const,
        };
      }),
      ...legacyPendingSnap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          email: (d.email as string) ?? "",
          role: (d.role as string) ?? "member",
          invited_at: d.invited_at?.toDate?.()?.toISOString() ?? null,
          source: "legacy_organization_seats" as const,
        };
      }),
    ];
  }

  return NextResponse.json({ seats, allocation_summary, pending_invites });
}
