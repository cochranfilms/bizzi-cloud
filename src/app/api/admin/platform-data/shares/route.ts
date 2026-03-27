/**
 * GET /api/admin/platform-data/shares
 * Paginated folder_shares for admin visibility (all scopes).
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
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
  const ownerId = (searchParams.get("ownerId") ?? "").trim();
  const recipientMode = (searchParams.get("recipientMode") ?? "").trim();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const hideExpired = searchParams.get("hideExpired") === "1";

  const db = getAdminFirestore();
  const authService = getAdminAuth();

  let baseQuery: Query = db.collection("folder_shares");

  if (ownerId) {
    baseQuery = baseQuery.where("owner_id", "==", ownerId);
  }

  baseQuery = baseQuery.orderBy("created_at", "desc");

  const fetchCap = Math.min(400, limit * page + (recipientMode || q || hideExpired ? 120 : 0));
  const snap = await baseQuery.limit(Math.max(fetchCap, 50)).get();

  const now = new Date();

  type ShareRow = {
    id: string;
    token: string;
    folder_name: string;
    owner_id: string;
    owner_email: string | null;
    permission: string;
    access_level: string | null;
    recipient_mode: string | null;
    workspace_target: { kind?: string; id?: string } | null;
    target_organization_id: string | null;
    linked_drive_id: string | null;
    backup_file_id: string | null;
    virtual_file_count: number | null;
    expires_at: string | null;
    created_at: string | null;
    is_expired: boolean;
    share_path: string;
  };

  let rows: ShareRow[] = snap.docs.map((d) => {
    const data = d.data();
    const expiresRaw = data.expires_at;
    const expiresAt =
      expiresRaw && typeof expiresRaw === "object" && "toDate" in expiresRaw
        ? (expiresRaw as { toDate: () => Date }).toDate()
        : null;
    const isExpired = expiresAt !== null && expiresAt < now;
    const refIds = data.referenced_file_ids as unknown;
    const virtualCount = Array.isArray(refIds) ? refIds.length : null;

    const token = (data.token as string) ?? d.id;
    const baseUrl =
      (process.env.NEXT_PUBLIC_APP_URL ||
        (typeof process.env.VERCEL_URL === "string" ? `https://${process.env.VERCEL_URL}` : "")) ??
      "";

    return {
      id: d.id,
      token,
      folder_name: (data.folder_name as string) ?? "—",
      owner_id: (data.owner_id as string) ?? "",
      owner_email: null as string | null,
      permission: (data.permission as string) ?? "view",
      access_level: (data.access_level as string) ?? null,
      recipient_mode: (data.recipient_mode as string) ?? null,
      workspace_target: (data.workspace_target as { kind?: string; id?: string }) ?? null,
      target_organization_id: (data.target_organization_id as string) ?? null,
      linked_drive_id: (data.linked_drive_id as string) ?? null,
      backup_file_id: (data.backup_file_id as string) ?? null,
      virtual_file_count: virtualCount,
      expires_at: firestoreDateToIso(data.expires_at),
      created_at: firestoreDateToIso(data.created_at),
      is_expired: isExpired,
      share_path: baseUrl ? `${baseUrl.replace(/\/$/, "")}/s/${token}` : `/s/${token}`,
    };
  });

  const ownerUids = [...new Set(rows.map((r) => r.owner_id).filter(Boolean))];
  const emailByUid = new Map<string, string>();
  for (let i = 0; i < ownerUids.length; i += 100) {
    const batch = ownerUids.slice(i, i + 100);
    try {
      const res = await authService.getUsers(batch.map((uid) => ({ uid })));
      for (const u of res.users) {
        if (u.email) emailByUid.set(u.uid, u.email);
      }
    } catch {
      /* skip */
    }
  }
  rows = rows.map((r) => ({ ...r, owner_email: emailByUid.get(r.owner_id) ?? null }));

  if (recipientMode === "workspace" || recipientMode === "email") {
    rows = rows.filter((r) => r.recipient_mode === recipientMode);
  }

  if (hideExpired) {
    rows = rows.filter((r) => !r.is_expired);
  }

  if (q) {
    rows = rows.filter(
      (r) =>
        r.folder_name.toLowerCase().includes(q) ||
        r.token.toLowerCase().includes(q) ||
        r.owner_id.toLowerCase().includes(q) ||
        (r.owner_email?.toLowerCase().includes(q) ?? false) ||
        (r.workspace_target?.id?.toLowerCase().includes(q) ?? false)
    );
  }

  const total = rows.length;
  const start = (page - 1) * limit;
  const shares = rows.slice(start, start + limit);

  return NextResponse.json({ shares, total, page, limit });
}
