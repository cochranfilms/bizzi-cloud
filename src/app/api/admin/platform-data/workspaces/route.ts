/**
 * GET /api/admin/platform-data/workspaces
 * Paginated workspaces with optional filters (org, type, name search).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import type { Query } from "firebase-admin/firestore";
import type { WorkspaceType } from "@/types/workspace";
import { firestoreDateToIso } from "@/lib/firestore-date";

const VALID_TYPES: WorkspaceType[] = [
  "private",
  "org_shared",
  "team",
  "project",
  "gallery",
];

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)));
  const organizationId = (searchParams.get("organizationId") ?? "").trim();
  const workspaceType = (searchParams.get("workspaceType") ?? "").trim() as WorkspaceType | "";
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const db = getAdminFirestore();

  let base: Query = db.collection("workspaces");

  if (organizationId) {
    base = base.where("organization_id", "==", organizationId);
  }
  if (workspaceType && VALID_TYPES.includes(workspaceType)) {
    base = base.where("workspace_type", "==", workspaceType);
  }

  base = base.orderBy("updated_at", "desc");

  const fetchLimit = Math.min(500, limit * page + (q ? 200 : 0));
  const snap = await base.limit(fetchLimit).get();

  type Row = {
    id: string;
    name: string;
    workspace_type: string;
    organization_id: string;
    organization_name: string | null;
    drive_id: string | null;
    drive_type: string | null;
    created_by: string;
    member_count: number;
    gallery_id: string | null;
    is_system_workspace: boolean;
    created_at: string | null;
    updated_at: string | null;
  };

  const orgIds = new Set<string>();
  for (const d of snap.docs) {
    const oid = d.data().organization_id as string | undefined;
    if (oid) orgIds.add(oid);
  }
  const orgNames = new Map<string, string>();
  await Promise.all(
    [...orgIds].map(async (oid) => {
      const o = await db.collection("organizations").doc(oid).get();
      const n = (o.data()?.name as string | undefined)?.trim();
      orgNames.set(oid, n || "—");
    })
  );

  let rows: Row[] = snap.docs.map((d) => {
    const data = d.data();
    const oid = (data.organization_id as string) ?? "";
    const members = data.member_user_ids;
    const memberCount = Array.isArray(members) ? members.length : 0;
    return {
      id: d.id,
      name: (data.name as string) ?? "",
      workspace_type: (data.workspace_type as string) ?? "private",
      organization_id: oid,
      organization_name: oid ? orgNames.get(oid) ?? null : null,
      drive_id: (data.drive_id as string) ?? null,
      drive_type: (data.drive_type as string) ?? null,
      created_by: (data.created_by as string) ?? "",
      member_count: memberCount,
      gallery_id: (data.gallery_id as string) ?? null,
      is_system_workspace: Boolean(data.is_system_workspace),
      created_at: firestoreDateToIso(data.created_at) ?? (typeof data.created_at === "string" ? data.created_at : null),
      updated_at: firestoreDateToIso(data.updated_at) ?? (typeof data.updated_at === "string" ? data.updated_at : null),
    };
  });

  if (q) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.organization_id.toLowerCase().includes(q) ||
        (r.organization_name?.toLowerCase().includes(q) ?? false)
    );
  }

  const total = rows.length;
  const start = (page - 1) * limit;
  const workspaces = rows.slice(start, start + limit);

  return NextResponse.json({ workspaces, total, page, limit });
}
