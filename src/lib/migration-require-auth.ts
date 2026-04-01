import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" && process.env.NODE_ENV === "development";

export async function migrationRequireUid(
  request: Request,
  bodyDevUid?: string | null
): Promise<{ uid: string; email?: string } | NextResponse> {
  if (isDevAuthBypass() && bodyDevUid) {
    return { uid: bodyDevUid };
  }
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization", code: "auth_required" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return NextResponse.json({ error: "Invalid token", code: "auth_invalid" }, { status: 401 });
  }
}
