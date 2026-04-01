import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { MIGRATION_JOBS_COLLECTION, MIGRATION_FILES_SUBCOLLECTION } from "@/lib/migration-constants";
import { migrationRequireUid } from "@/lib/migration-require-auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await migrationRequireUid(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const db = getAdminFirestore();
  const doc = await db.collection(MIGRATION_JOBS_COLLECTION).doc(id).get();
  if (!doc.exists) {
    return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  }
  const row = doc.data()!;
  if (row.user_id !== auth.uid) {
    return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  }

  const filesSnap = await db
    .collection(MIGRATION_JOBS_COLLECTION)
    .doc(id)
    .collection(MIGRATION_FILES_SUBCOLLECTION)
    .limit(200)
    .get();
  const files = filesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ job: { id: doc.id, ...row }, files_preview: files });
}
