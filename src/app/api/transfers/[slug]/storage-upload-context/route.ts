import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  resolveTransferModalUploadPlacement,
  StorageFolderAccessError,
} from "@/lib/transfer-storage-package";
import { userCanManageTransfer } from "@/lib/transfer-team-access";
import { NextResponse } from "next/server";

/**
 * POST /api/transfers/{slug}/storage-upload-context — v2 folder placement for transfer-modal uploads
 * (Storage/Transfers/{transfer name}/…). Uses transfer.name from Firestore as the folder title.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { slug } = await params;
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  let body: { relative_path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const relativePath =
    typeof body.relative_path === "string" ? body.relative_path : "";
  if (!relativePath.trim()) {
    return NextResponse.json({ error: "relative_path is required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection("transfers").doc(slug);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }
  const data = snap.data()!;
  if (!(await userCanManageTransfer(uid, data))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const placement = await resolveTransferModalUploadPlacement(
      db,
      uid,
      ref,
      data as Record<string, unknown>,
      slug,
      relativePath
    );
    return NextResponse.json(placement);
  } catch (err) {
    if (err instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[transfers storage-upload-context]", err);
    return NextResponse.json({ error: "Placement failed" }, { status: 500 });
  }
}
