import { abortMultipartUpload, isB2Configured } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const STALE_HOURS = 24;
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isB2Configured()) {
    return NextResponse.json({ error: "B2 not configured" }, { status: 503 });
  }

  const db = getAdminFirestore();
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - STALE_HOURS);

  const staleSnap = await db
    .collection("upload_sessions")
    .where("status", "in", ["pending", "uploading"])
    .where("expiresAt", "<", cutoff.toISOString())
    .limit(100)
    .get();

  let aborted = 0;
  for (const docSnap of staleSnap.docs) {
    const data = docSnap.data();
    const objectKey = data?.objectKey;
    const uploadId = data?.uploadId;
    if (objectKey && uploadId) {
      try {
        await abortMultipartUpload(objectKey, uploadId);
        await docSnap.ref.update({
          status: "aborted",
          updatedAt: new Date().toISOString(),
        });
        aborted++;
      } catch (err) {
        console.error("[uploads/cleanup] Failed to abort session:", docSnap.id, err);
      }
    }
  }

  return NextResponse.json({ aborted, total: staleSnap.size });
}
