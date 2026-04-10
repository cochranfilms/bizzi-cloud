import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { migrationRequireUid } from "@/lib/migration-require-auth";
import { getGoogleAccessToken } from "@/lib/migration-provider-account";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Returns a short-lived Google access token for the signed-in user so the browser
 * can open Google Picker with the same scopes as migration (drive.file).
 */
export async function POST(req: Request) {
  const auth = await migrationRequireUid(req);
  if (auth instanceof NextResponse) return auth;

  const rl = checkRateLimit(`migration_google_picker_token:${auth.uid}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", code: "rate_limited" }, { status: 429 });
  }

  const db = getAdminFirestore();
  try {
    const access_token = await getGoogleAccessToken(db, auth.uid);
    return NextResponse.json({ access_token });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google Drive is not connected";
    return NextResponse.json({ error: msg, code: "not_connected" }, { status: 400 });
  }
}
