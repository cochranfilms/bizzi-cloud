/**
 * GET /api/admin/auth-check
 * Returns { ok: true } if the user is authenticated and allowed to access admin.
 * Uses same logic as requireAdminAuth (ALLOWED_ADMIN_EMAILS).
 * Used by AdminAuthGuard to verify admin access on the client.
 */
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ ok: true });
}
