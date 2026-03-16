/**
 * POST /api/conform/start
 * V3 Bizzi Conform: Start conform session, validate assets, switch preferredRendition to original.
 * Same logical path will now resolve to original bytes at the mount layer.
 */
import { verifyIdToken } from "@/lib/firebase-admin";
import { startConformSession } from "@/lib/conform/conform-service";
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

  let body: {
    projectId: string;
    folderPath?: string | null;
    assetIds?: string[] | null;
    pinOriginals?: boolean;
    keepProxiesCached?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, folderPath, assetIds, pinOriginals, keepProxiesCached } = body;
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  try {
    const result = await startConformSession(uid, { projectId, folderPath, assetIds }, {
      pinOriginals: pinOriginals ?? false,
      keepProxiesCached: keepProxiesCached ?? false,
    });

    return NextResponse.json({
      sessionId: result.sessionId,
      status: result.status,
      totalAssets: result.totalAssets,
      switchedAssets: result.switchedAssets,
      failedAssets: result.failedAssets,
      skippedAssets: result.skippedAssets,
      report: result.report,
    });
  } catch (err) {
    console.error("[conform/start]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Conform failed" },
      { status: 500 }
    );
  }
}
