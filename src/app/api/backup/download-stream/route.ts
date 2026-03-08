import { createHmac } from "crypto";
import { isB2Configured } from "@/lib/b2";
import { getDownloadUrl } from "@/lib/cdn";
import { NextResponse } from "next/server";

function verifyDownloadSignature(
  objectKey: string,
  exp: number,
  sig: string
): boolean {
  const secret = process.env.B2_SECRET_ACCESS_KEY;
  if (!secret) return false;
  const payload = `backup-download|${objectKey}|${exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  return sig === expected && exp > Math.floor(Date.now() / 1000);
}

/** Redirect to B2/CDN - no file bytes through Vercel (4.5 MB limit). */
export async function GET(request: Request) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const expParam = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  const name = url.searchParams.get("name") ?? "download";

  if (!objectKey || !expParam || !sig) {
    return new NextResponse("Missing parameters", { status: 400 });
  }

  const exp = parseInt(expParam, 10);
  if (!verifyDownloadSignature(objectKey, exp, sig)) {
    return new NextResponse("Invalid or expired download URL", { status: 403 });
  }

  try {
    const safeName = name.replace(/[^\w\s.-]/g, "_").replace(/\s+/g, "_") || "download";
    const remainingSec = Math.max(60, exp - Math.floor(Date.now() / 1000));
    const directUrl = await getDownloadUrl(objectKey, remainingSec, safeName);
    return NextResponse.redirect(directUrl, 302);
  } catch (err) {
    console.error("[backup download-stream] Error:", err);
    return new NextResponse(
      err instanceof Error ? err.message : "Download failed",
      { status: 500 }
    );
  }
}
