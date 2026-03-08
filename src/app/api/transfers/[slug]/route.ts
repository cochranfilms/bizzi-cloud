import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const doc = await db.collection("transfers").doc(slug).get();

  if (!doc.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const data = doc.data();
  if (!data) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const expiresAt = data.expires_at ?? null;
  const isExpired = expiresAt && new Date(expiresAt) < new Date();
  const status = isExpired ? "expired" : data.status ?? "active";

  const files = (data.files ?? []).map((f: Record<string, unknown>) => ({
    id: f.id,
    name: f.name,
    path: f.path,
    type: "file",
    views: f.views ?? 0,
    downloads: f.downloads ?? 0,
    backupFileId: f.backup_file_id ?? undefined,
    objectKey: f.object_key ?? undefined,
  }));

  return NextResponse.json({
    id: slug,
    slug,
    name: data.name,
    clientName: data.clientName,
    clientEmail: data.clientEmail ?? undefined,
    files,
    permission: data.permission ?? "downloadable",
    password: data.password ?? null,
    expiresAt: expiresAt ?? null,
    createdAt: data.created_at,
    status,
  });
}
