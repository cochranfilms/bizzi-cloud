/**
 * GET /api/admin/platform-data/activity
 * Paginated activity_logs (product events across workspaces and orgs).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import type { Query } from "firebase-admin/firestore";
import { firestoreDateToIso } from "@/lib/firestore-date";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)));
  const actorUserId = (searchParams.get("actorUserId") ?? "").trim();
  const eventType = (searchParams.get("eventType") ?? "").trim();
  const scopeType = (searchParams.get("scopeType") ?? "").trim();
  const organizationId = (searchParams.get("organizationId") ?? "").trim();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const db = getAdminFirestore();
  let base: Query = db.collection("activity_logs");

  if (actorUserId && eventType) {
    base = base.where("actor_user_id", "==", actorUserId).where("event_type", "==", eventType);
  } else if (actorUserId) {
    base = base.where("actor_user_id", "==", actorUserId);
  } else if (organizationId && scopeType) {
    base = base.where("organization_id", "==", organizationId).where("scope_type", "==", scopeType);
  } else if (organizationId) {
    base = base.where("organization_id", "==", organizationId);
  } else if (scopeType) {
    base = base.where("scope_type", "==", scopeType);
  } else if (eventType) {
    base = base.where("event_type", "==", eventType);
  }

  base = base.orderBy("created_at", "desc");

  const extra = q ? 250 : 0;
  const snap = await base.limit(Math.min(600, page * limit + extra)).get();

  type ActivityRow = {
    id: string;
    event_type: string;
    actor_user_id: string;
    scope_type: string;
    organization_id: string | null;
    workspace_id: string | null;
    workspace_type: string | null;
    linked_drive_id: string | null;
    drive_type: string | null;
    file_id: string | null;
    folder_id: string | null;
    target_name: string | null;
    target_type: string | null;
    file_path: string | null;
    created_at: string | null;
    metadata: Record<string, unknown> | null;
  };

  let rows: ActivityRow[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      event_type: (data.event_type as string) ?? "",
      actor_user_id: (data.actor_user_id as string) ?? "",
      scope_type: (data.scope_type as string) ?? "",
      organization_id: (data.organization_id as string) ?? null,
      workspace_id: (data.workspace_id as string) ?? null,
      workspace_type: (data.workspace_type as string) ?? null,
      linked_drive_id: (data.linked_drive_id as string) ?? null,
      drive_type: (data.drive_type as string) ?? null,
      file_id: (data.file_id as string) ?? null,
      folder_id: (data.folder_id as string) ?? null,
      target_name: (data.target_name as string) ?? null,
      target_type: (data.target_type as string) ?? null,
      file_path: (data.file_path as string) ?? null,
      created_at: firestoreDateToIso(data.created_at),
      metadata: (data.metadata as Record<string, unknown>) ?? null,
    };
  });

  if (q) {
    rows = rows.filter(
      (r) =>
        r.event_type.toLowerCase().includes(q) ||
        r.actor_user_id.toLowerCase().includes(q) ||
        (r.workspace_id?.toLowerCase().includes(q) ?? false) ||
        (r.target_name?.toLowerCase().includes(q) ?? false) ||
        (r.file_path?.toLowerCase().includes(q) ?? false)
    );
  }

  const total = rows.length;
  const start = (page - 1) * limit;
  const events = rows.slice(start, start + limit);

  return NextResponse.json({ events, total, page, limit });
}
