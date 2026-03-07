import { createHmac } from "crypto";
import { getObject, isB2Configured } from "@/lib/b2";
import { NextResponse } from "next/server";

function verifyDownloadSignature(
  objectKey: string,
  exp: number,
  sig: string
): boolean {
  const secret = process.env.B2_SECRET_ACCESS_KEY;
  if (!secret) return false;
  const payload = `download|${objectKey}|${exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  return sig === expected && exp > Math.floor(Date.now() / 1000);
}

async function* nodeStreamToIterator(
  stream: AsyncIterable<Uint8Array>
): AsyncGenerator<Uint8Array> {
  for await (const chunk of stream) {
    yield new Uint8Array(chunk);
  }
}

function toWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream {
  try {
    const { Readable } = require("stream");
    if (typeof Readable.toWeb === "function") {
      return Readable.toWeb(nodeStream) as ReadableStream;
    }
  } catch {
    /* fallthrough */
  }
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of nodeStreamToIterator(
          nodeStream as AsyncIterable<Uint8Array>
        )) {
          controller.enqueue(chunk);
        }
      } catch (e) {
        controller.error(e);
      } finally {
        controller.close();
      }
    },
  });
}

/** Stream file with Content-Disposition: attachment for instant download (no new tab). */
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
    const { body, contentLength, contentType } = await getObject(objectKey);
    const safeName = name.replace(/[^\w\s.-]/g, "_").replace(/\s+/g, "_") || "download";

    const headers: Record<string, string> = {
      "Content-Length": String(contentLength),
      "Content-Disposition": `attachment; filename="${safeName}"`,
    };
    if (contentType) headers["Content-Type"] = contentType;

    return new NextResponse(toWebStream(body), {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[share download-stream] Error:", err);
    return new NextResponse(
      err instanceof Error ? err.message : "Download failed",
      { status: 500 }
    );
  }
}
