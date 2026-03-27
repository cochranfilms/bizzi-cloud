/**
 * GET — Recent file comments in the viewer's organization (org admins only).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { getFileDisplayName } from "@/lib/file-access";
import { canViewOrgCommentActivity } from "@/lib/file-comment-moderation";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;
  if (!orgId) {
    return NextResponse.json({ error: "Not in an organization" }, { status: 403 });
  }

  const allowed = await canViewOrgCommentActivity(orgId, uid);
  if (!allowed) return NextResponse.json({ error: "Org admin only" }, { status: 403 });

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "40", 10), 100);

  let snap;
  try {
    snap = await db
      .collection("file_comments")
      .where("organization_id", "==", orgId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
  } catch (e) {
    console.error("[org comments activity]", e);
    return NextResponse.json(
      { error: "Query failed; deploy indexes and backfill file_comments." },
      { status: 500 }
    );
  }

  const items = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const fileId = data.fileId as string;
      const body = (data.body as string) ?? "";
      const fileName = await getFileDisplayName(fileId);
      return {
        id: d.id,
        fileId,
        fileName,
        authorUserId: data.authorUserId as string,
        authorDisplayName: (data.author_display_name ?? null) as string | null,
        authorRoleSnapshot: (data.author_role_snapshot ?? null) as string | null,
        bodyPreview: body.length > 120 ? `${body.slice(0, 117)}…` : body,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        workspace_type: (data.workspace_type ?? "organization") as string,
      };
    })
  );

  return NextResponse.json({ items });
}
