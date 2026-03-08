import { objectExists, isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  try {
    return await handleDedupeCheck(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[uploads/dedupe/check] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleDedupeCheck(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body: expected JSON" },
      { status: 400 }
    );
  }

  let uid: string;
  if (isDevAuthBypass() && typeof body.user_id === "string") {
    uid = body.user_id;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  const {
    fingerprint,
    content_hash: contentHash,
    workspace_id: workspaceId,
  } = body;

  if (!fingerprint && !contentHash) {
    return NextResponse.json(
      { error: "fingerprint or content_hash is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  if (contentHash && typeof contentHash === "string" && /^[a-f0-9]{64}$/i.test(contentHash)) {
    const objectKey = `content/${contentHash.toLowerCase()}`;
    const exists = await objectExists(objectKey);
    if (exists) {
      return NextResponse.json({
        exists: true,
        objectKey,
        matchType: "content_hash",
      });
    }
  }

  if (fingerprint && typeof fingerprint === "string") {
    let dedupeQuery = db
      .collection("dedupe_index")
      .where("userId", "==", uid)
      .where("fingerprint", "==", fingerprint);

    if (workspaceId && typeof workspaceId === "string") {
      dedupeQuery = dedupeQuery.where("workspaceId", "==", workspaceId) as typeof dedupeQuery;
    } else {
      dedupeQuery = dedupeQuery.where("workspaceId", "==", null) as typeof dedupeQuery;
    }

    const snapshot = await dedupeQuery.limit(1).get();
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();
      const objectKey = data?.objectKey;
      if (objectKey) {
        const exists = await objectExists(objectKey);
        if (exists) {
          return NextResponse.json({
            exists: true,
            objectKey,
            matchType: "fingerprint",
          });
        }
      }
    }
  }

  return NextResponse.json({ exists: false });
}
