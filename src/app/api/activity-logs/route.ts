/**
 * GET /api/activity-logs
 * Returns activity for the current user.
 * Query: ?scope=personal|organization&organization_id=...&limit=50
 * - scope=personal: actor's personal activity (scope_type=personal_account)
 * - scope=organization + organization_id: org activity (user must have seat)
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "personal";
  const organizationId = url.searchParams.get("organization_id") ?? null;
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const db = getAdminFirestore();

  if (scope === "organization") {
    if (!organizationId) {
      return NextResponse.json(
        { error: "organization_id required when scope=organization" },
        { status: 400 }
      );
    }
    const seatSnap = await db
      .collection("organization_seats")
      .doc(`${organizationId}_${uid}`)
      .get();
    if (!seatSnap.exists) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    const snap = await db
      .collection("activity_logs")
      .where("organization_id", "==", organizationId)
      .where("scope_type", "==", "organization")
      .orderBy("created_at", "desc")
      .limit(limit)
      .get();

    const items = snap.docs.map((d) => {
      const data = d.data();
      const createdAt = data.created_at?.toDate?.();
      return {
        id: d.id,
        ...data,
        created_at: createdAt ? createdAt.toISOString() : null,
      };
    });

    return NextResponse.json({ items });
  }

  // Personal scope
  const snap = await db
    .collection("activity_logs")
    .where("actor_user_id", "==", uid)
    .where("scope_type", "==", "personal_account")
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();

  const items = snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.created_at?.toDate?.();
    return {
      id: d.id,
      ...data,
      created_at: createdAt ? createdAt.toISOString() : null,
    };
  });

  return NextResponse.json({ items });
}
