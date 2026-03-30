/**
 * POST /api/client/verify-email
 * Verify client email against gallery invited_emails.
 * If matched, create signed session cookie and return success.
 * No Firebase Auth required.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  createClientSessionToken,
  buildSessionCookie,
} from "@/lib/client-session";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase();
    const db = getAdminFirestore();

    const snap = await db
      .collection("galleries")
      .where("invited_emails", "array-contains", emailLower)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json(
        {
          error: "access_denied",
          message: "This email is not on any gallery guest lists yet.",
        },
        { status: 403 }
      );
    }

    const token = createClientSessionToken(emailLower);
    const cookie = buildSessionCookie(token);

    const res = NextResponse.json({ ok: true, email: emailLower });
    res.headers.set("Set-Cookie", cookie);
    return res;
  } catch (err) {
    if (err instanceof Error && err.message.includes("CLIENT_SESSION_SECRET")) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }
    throw err;
  }
}
