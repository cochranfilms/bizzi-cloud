import { createHmac } from "crypto";
import {
  getObject,
  getObjectRange,
  isB2Configured,
} from "@/lib/b2";
import { NextResponse } from "next/server";

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

function parseRange(rangeHeader: string | null): { start: number; end?: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
  const match = rangeHeader.replace(/^bytes=/, "").match(/(\d+)-(\d*)/);
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : undefined;
  return { start, end };
}

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

  const rangeHeader = request.headers.get("Range");
  const parsed = parseRange(rangeHeader);

  try {
    if (parsed) {
      const end = parsed.end ?? Number.MAX_SAFE_INTEGER;
      const { body, contentLength, contentType, contentRange } =
        await getObjectRange(objectKey, { start: parsed.start, end });

      const headers: Record<string, string> = {
        "Accept-Ranges": "bytes",
        "Content-Length": String(contentLength),
      };
      if (contentType) headers["Content-Type"] = contentType;
      if (contentRange) headers["Content-Range"] = contentRange;

      return new NextResponse(toWebStream(body), {
        status: 206,
        headers,
      });
    }

    const { body, contentLength, contentType } = await getObject(objectKey);

    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Content-Length": String(contentLength),
    };
    if (contentType) headers["Content-Type"] = contentType;

    return new NextResponse(toWebStream(body), {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[video-stream] Error:", err);
    return new NextResponse(
      err instanceof Error ? err.message : "Stream failed",
      { status: 500 }
    );
  }
}
