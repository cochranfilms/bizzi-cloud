import {
  createPresignedDownloadUrl,
  isB2Configured,
} from "@/lib/b2";
import { verifyCdnSignature } from "@/lib/cdn";
import { NextResponse } from "next/server";

/**
 * Called by the Cloudflare CDN Worker to get a presigned B2 URL.
 * Validates the CDN signature and returns a short-lived presigned URL.
 * The Worker fetches from B2 using this URL; B2→Cloudflare egress is free (Bandwidth Alliance).
 */
export async function GET(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const expParam = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  const downloadFilename = url.searchParams.get("download") ?? undefined;
  const inlineDisposition =
    url.searchParams.get("inline") === "1" && !downloadFilename;

  if (!objectKey || !expParam || !sig) {
    return NextResponse.json(
      { error: "object_key, exp, and sig are required" },
      { status: 400 }
    );
  }

  const exp = parseInt(expParam, 10);
  if (isNaN(exp) || !verifyCdnSignature(objectKey, exp, sig, downloadFilename)) {
    return NextResponse.json(
      { error: "Invalid or expired CDN signature" },
      { status: 403 }
    );
  }

  try {
    const presignedUrl = await createPresignedDownloadUrl(
      objectKey,
      300, // 5 min - Worker fetches immediately
      downloadFilename,
      inlineDisposition
    );
    return NextResponse.json({ url: presignedUrl });
  } catch (err) {
    console.error("[cdn-presigned] B2 error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create presigned URL" },
      { status: 500 }
    );
  }
}
