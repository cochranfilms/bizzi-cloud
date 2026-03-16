/**
 * POST /api/conform/revert
 * Revert project to proxy mode. Same logical path will resolve to proxy bytes again.
 */
import { verifyIdToken } from "@/lib/firebase-admin";
import { revertToProxies } from "@/lib/conform/conform-service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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

  let body: { projectId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId } = body;
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  try {
    await revertToProxies(uid, projectId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[conform/revert]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Revert failed" },
      { status: 500 }
    );
  }
}
