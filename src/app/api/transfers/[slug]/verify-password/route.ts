import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifySecret } from "@/lib/gallery-access";
import { transferIsRecipientVisible } from "@/lib/transfer-resolve";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Verify transfer password without performing a download.
 * Used by the client to "unlock" password-protected transfer view.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const password = body.password as string | undefined;

  const db = getAdminFirestore();
  const transferSnap = await db.collection("transfers").doc(slug).get();

  if (!transferSnap.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const transfer = transferSnap.data();
  if (!transfer) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  if (!transferIsRecipientVisible(transfer as Record<string, unknown>)) {
    return NextResponse.json({ error: "Transfer not available" }, { status: 403 });
  }

  const expiresAt = transfer.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    return NextResponse.json({ error: "Transfer expired" }, { status: 410 });
  }

  const passwordHash = transfer.password_hash ?? null;
  const legacyPassword = transfer.password ?? null;
  const requiresPassword = !!passwordHash || !!legacyPassword;

  if (!requiresPassword) {
    return NextResponse.json({ ok: true });
  }

  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "Password required" }, { status: 403 });
  }

  if (passwordHash) {
    const ok = await verifySecret(password, passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }
  } else {
    const a = Buffer.from(password, "utf8");
    const b = Buffer.from(legacyPassword, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }
  }

  return NextResponse.json({ ok: true });
}
