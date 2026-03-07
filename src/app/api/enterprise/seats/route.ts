import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

/** GET - List all seats in the user's organization. */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;
  if (!orgId) {
    return NextResponse.json(
      { error: "You are not in an organization" },
      { status: 403 }
    );
  }

  const seatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .get();

  const seats = await Promise.all(
    seatsSnap.docs.map(async (doc) => {
      const d = doc.data();
      const userId = d.user_id as string | undefined;
      let storage_used_bytes = 0;
      if (userId && userId.length > 0) {
        const filesSnap = await db
          .collection("backup_files")
          .where("userId", "==", userId)
          .get();
        for (const f of filesSnap.docs) {
          const data = f.data();
          if (data.deleted_at) continue;
          storage_used_bytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
        }
      }
      return {
        id: doc.id,
        organization_id: d.organization_id,
        user_id: d.user_id,
        role: d.role,
        email: d.email,
        display_name: d.display_name ?? null,
        status: d.status,
        invited_at: d.invited_at?.toDate?.()?.toISOString() ?? null,
        accepted_at: d.accepted_at?.toDate?.()?.toISOString() ?? null,
        storage_quota_bytes: d.storage_quota_bytes ?? null,
        storage_used_bytes,
      };
    })
  );

  return NextResponse.json({ seats });
}
