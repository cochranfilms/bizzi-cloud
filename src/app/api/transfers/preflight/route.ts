import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { preflightTransferBackupFiles } from "@/lib/transfer-preflight";
import { NextResponse } from "next/server";

/** POST /api/transfers/preflight — reference-first check before creating a transfer. */
export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const idsRaw = body.backup_file_ids ?? body.backupFileIds;
  const organizationId =
    typeof body.organizationId === "string" && body.organizationId.trim()
      ? body.organizationId.trim()
      : null;

  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json(
      { error: "backup_file_ids must be a non-empty array" },
      { status: 400 }
    );
  }

  const backupFileIds = idsRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (backupFileIds.length === 0) {
    return NextResponse.json({ error: "No valid backup_file_ids" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const results = await preflightTransferBackupFiles({
    db,
    uid,
    organizationId,
    backupFileIds,
  });

  return NextResponse.json({ results });
}
