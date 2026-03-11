/**
 * GET /api/admin/storage/bucket-stats
 * Returns real storage metrics from the B2 bucket (actual bytes stored).
 * Admin only. May be slow for large buckets.
 */
import { requireAdminAuth } from "@/lib/admin-auth";
import { isB2Configured, listBucketStats } from "@/lib/b2";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "B2 not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const prefix = searchParams.get("prefix") ?? undefined;
  const maxObjects = Math.min(
    100_000,
    parseInt(searchParams.get("max") ?? "50000", 10) || 50000
  );

  try {
    const content = await listBucketStats(
      prefix || "content/",
      maxObjects
    );
    const all = await listBucketStats(undefined, maxObjects);

    return NextResponse.json({
      content,
      all,
      note: content.truncated || all.truncated
        ? "Results may be truncated for large buckets"
        : null,
    });
  } catch (err) {
    console.error("[admin/bucket-stats]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list bucket" },
      { status: 500 }
    );
  }
}
