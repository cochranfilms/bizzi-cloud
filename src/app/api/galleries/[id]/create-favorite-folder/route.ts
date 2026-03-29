/**
 * @deprecated Use POST /api/galleries/[id]/favorites/[listId]/materialize or /selects/[listId]/materialize,
 * or POST /api/galleries/[id]/proofing-merge for merged snapshots. Legacy flat favorites folder is no longer supported.
 */
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }

  try {
    await verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: "deprecated",
      message:
        "Create favorite folder is replaced by per-list materialization: POST .../favorites/{listId}/materialize or .../selects/{listId}/materialize. For a merged snapshot of all lists use POST .../proofing-merge.",
    },
    { status: 410 }
  );
}
