import { createHmac } from "crypto";
import { isB2Configured } from "@/lib/b2";
import { getDownloadUrl } from "@/lib/cdn";
import { NextResponse } from "next/server";

function verifyStreamSignature(
  objectKey: string,
  exp: number,
  sig: string
): boolean {
  const secret = process.env.B2_SECRET_ACCESS_KEY;
  if (!secret) return false;
  const payload = `${objectKey}|${exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  return sig === expected && exp > Math.floor(Date.now() / 1000);
}

/** Redirect to direct B2/CDN URL. No file bytes through Vercel (4.5 MB limit). */
export async function GET(request: Request) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const expParam = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");

  if (!objectKey || !expParam || !sig) {
    return new NextResponse("Missing parameters", { status: 400 });
  }

  const exp = parseInt(expParam, 10);
  if (!verifyStreamSignature(objectKey, exp, sig)) {
    return new NextResponse("Invalid or expired stream URL", { status: 403 });
  }

  try {
    const remainingSec = Math.max(60, exp - Math.floor(Date.now() / 1000));
    const directUrl = await getDownloadUrl(objectKey, remainingSec);
    return NextResponse.redirect(directUrl, 302);
  } catch (err) {
    console.error("[video-stream] Redirect error:", err);
    return new NextResponse(
      err instanceof Error ? err.message : "Stream failed",
      { status: 500 }
    );
  }
}
