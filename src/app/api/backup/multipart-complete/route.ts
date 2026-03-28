import {
  completeMultipartUpload,
  getObjectMetadata,
  isB2Configured,
} from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import {
  commitReservation,
  getReservationDoc,
  releaseReservation,
} from "@/lib/storage-quota-reservations";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  try {
    return await handleMultipartComplete(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[multipart-complete] Unhandled error:", err);
    return NextResponse.json(
      { error: message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleMultipartComplete(request: Request) {
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
  const { user_id: userIdFromBody } = body;

  let uid: string | null = null;
  if (isDevAuthBypass() && typeof userIdFromBody === "string") {
    uid = userIdFromBody;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization" },
        { status: 401 }
      );
    }
    try {
      uid = (await verifyIdToken(token)).uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  const { object_key: objectKey, upload_id: uploadId, parts, reservation_id: reservationIdRaw } =
    body;

  if (
    !objectKey ||
    typeof objectKey !== "string" ||
    !uploadId ||
    typeof uploadId !== "string" ||
    !Array.isArray(parts) ||
    parts.length === 0
  ) {
    return NextResponse.json(
      { error: "object_key, upload_id, and parts array are required" },
      { status: 400 }
    );
  }

  const reservation_id =
    typeof reservationIdRaw === "string" && reservationIdRaw.length > 0 ? reservationIdRaw : null;

  const validatedParts: { partNumber: number; etag: string }[] = [];
  for (const p of parts) {
    if (p && typeof p.partNumber === "number" && typeof p.etag === "string" && p.etag) {
      validatedParts.push({ partNumber: p.partNumber, etag: p.etag.replace(/^"|"$/g, "") });
    }
  }
  if (validatedParts.length === 0) {
    return NextResponse.json({ error: "No valid parts provided" }, { status: 400 });
  }

  try {
    await completeMultipartUpload(objectKey, uploadId, validatedParts);

    if (reservation_id && uid) {
      const row = await getReservationDoc(reservation_id);
      if (!row) {
        console.warn("[multipart-complete] reservation missing", { reservation_id, objectKey });
      } else {
        const d = row.data;
        const st = d.status as string | undefined;
        if (st !== "pending") {
          console.warn("[multipart-complete] reservation not pending", {
            reservation_id,
            st,
          });
        } else if (d.requesting_user_id !== uid) {
          await releaseReservation(reservation_id, "finalize_failed").catch(() => {});
          return NextResponse.json({ error: "Reservation mismatch" }, { status: 403 });
        } else {
          const expected = typeof d.bytes === "number" ? d.bytes : -1;
          const meta = await getObjectMetadata(objectKey);
          const actual = meta?.contentLength ?? -1;
          if (actual !== expected) {
            await releaseReservation(reservation_id, "size_mismatch").catch(() => {});
            console.warn("[multipart-complete] size mismatch orphan", {
              objectKey,
              reservation_id,
              expected,
              actual,
            });
            return NextResponse.json(
              { error: "Uploaded size does not match expected size. The object may need cleanup." },
              { status: 400 }
            );
          }
          await commitReservation(reservation_id);
        }
      }
    }

    return NextResponse.json({ objectKey, ok: true });
  } catch (err) {
    if (reservation_id) {
      await releaseReservation(reservation_id, "finalize_failed").catch(() => {});
    }
    const message = err instanceof Error ? err.message : "Failed to complete multipart upload";
    console.error("[multipart-complete] B2 error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
