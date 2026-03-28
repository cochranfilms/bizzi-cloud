/**
 * GET /api/admin/enterprise/organizations
 * Admin-only: List all organizations with seat counts.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { ORGANIZATION_INVITES_COLLECTION } from "@/lib/organization-invites";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const db = getAdminFirestore();

  const orgsSnap = await db.collection("organizations").get();
  const seatsSnap = await db.collection("organization_seats").get();
  const invitesSnap = await db.collection(ORGANIZATION_INVITES_COLLECTION).get();

  const seatsByOrg = new Map<string, Array<{ email?: string; status: string; role: string }>>();
  for (const doc of seatsSnap.docs) {
    const d = doc.data();
    const orgId = d.organization_id as string | undefined;
    if (!orgId) continue;
    const list = seatsByOrg.get(orgId) ?? [];
    list.push({
      email: d.email ?? undefined,
      status: (d.status as string) ?? "active",
      role: (d.role as string) ?? "member",
    });
    seatsByOrg.set(orgId, list);
  }

  const pendingInvitesByOrg = new Map<string, number>();
  for (const doc of invitesSnap.docs) {
    const d = doc.data();
    if (d.status !== "pending") continue;
    const orgId = d.organization_id as string | undefined;
    if (!orgId) continue;
    pendingInvitesByOrg.set(orgId, (pendingInvitesByOrg.get(orgId) ?? 0) + 1);
  }

  const organizations = await Promise.all(
    orgsSnap.docs.map(async (doc) => {
      const data = doc.data();
      const orgId = doc.id;
      const seats = seatsByOrg.get(orgId) ?? [];
      const activeSeats = seats.filter((s) => s.status === "active");
      const legacyPendingSeats = seats.filter((s) => s.status === "pending").length;
      const invitePending = pendingInvitesByOrg.get(orgId) ?? 0;
      const pendingCount = invitePending + legacyPendingSeats;
      const adminSeat = activeSeats.find((s) => s.role === "admin");
      const ownerEmail = adminSeat?.email ?? null;

      const removalDeadline = data.removal_deadline?.toDate?.();
      const addonIds = Array.isArray(data.addon_ids) ? data.addon_ids : [];
      return {
        id: orgId,
        name: data.name ?? "Unnamed",
        owner_email: ownerEmail,
        max_seats: data.max_seats ?? null,
        seat_count: seats.length,
        seats_accepted: activeSeats.length,
        seats_pending: pendingCount,
        storage_quota_bytes: data.storage_quota_bytes ?? null,
        storage_used_bytes: data.storage_used_bytes ?? 0,
        addon_ids: addonIds.length > 0 ? addonIds : [],
        created_at: data.created_at?.toDate?.()?.toISOString() ?? null,
        stripe_subscription_id: data.stripe_subscription_id ?? null,
        stripe_invoice_id: data.stripe_invoice_id ?? null,
        removal_requested_at: data.removal_requested_at?.toDate?.()?.toISOString() ?? null,
        removal_deadline: removalDeadline?.toISOString() ?? null,
      };
    })
  );

  organizations.sort((a, b) => {
    const aName = (a.name ?? "").toLowerCase();
    const bName = (b.name ?? "").toLowerCase();
    return aName.localeCompare(bName);
  });

  return NextResponse.json({ organizations });
}
