/**
 * Admin API auth helper.
 * Restricts access to users in ALLOWED_ADMIN_EMAILS (comma-separated).
 * If not set, any authenticated user can access (useful for dev).
 */
import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

export async function requireAdminAuth(
  request: Request
): Promise<{ uid: string; email: string | undefined } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  let email: string | undefined;
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const allowed = process.env.ALLOWED_ADMIN_EMAILS;
  if (allowed && allowed.trim()) {
    const emails = allowed.split(",").map((e) => e.trim().toLowerCase());
    const userEmail = (email ?? "").toLowerCase();
    if (!userEmail || !emails.includes(userEmail)) {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      );
    }
  }

  return { uid, email };
}
