import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { MIGRATION_OAUTH_STATES_COLLECTION } from "@/lib/migration-constants";
import { migrationRequireUid } from "@/lib/migration-require-auth";
import {
  MIGRATION_OAUTH_DEFAULT_RETURN,
  sanitizeMigrationOAuthReturnPath,
} from "@/lib/migration-oauth-return-path";
import { googleMigrationClientId, migrationOAuthRedirectBase } from "@/lib/migration-oauth-env";
import { checkRateLimit } from "@/lib/rate-limit";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export async function POST(request: Request) {
  const auth = await migrationRequireUid(request);
  if (auth instanceof NextResponse) return auth;

  const rl = checkRateLimit(`migration_oauth_google:${auth.uid}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", code: "rate_limited" }, { status: 429 });
  }

  const clientId = googleMigrationClientId();
  if (!clientId) {
    return NextResponse.json(
      { error: "Google migration OAuth not configured", code: "oauth_not_configured" },
      { status: 503 }
    );
  }

  const base = migrationOAuthRedirectBase();
  if (!base) {
    return NextResponse.json(
      { error: "MIGRATION_PUBLIC_APP_URL or NEXT_PUBLIC_APP_URL required", code: "app_url_missing" },
      { status: 503 }
    );
  }

  let returnPath = MIGRATION_OAUTH_DEFAULT_RETURN;
  try {
    const body = (await request.json().catch(() => ({}))) as { return_path?: unknown };
    returnPath = sanitizeMigrationOAuthReturnPath(body.return_path);
  } catch {
    returnPath = MIGRATION_OAUTH_DEFAULT_RETURN;
  }

  const state = randomBytes(24).toString("hex");
  const db = getAdminFirestore();
  await db.collection(MIGRATION_OAUTH_STATES_COLLECTION).doc(state).set({
    uid: auth.uid,
    provider: "google_drive",
    return_path: returnPath,
    created_at: FieldValue.serverTimestamp(),
    expires_at: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
  });

  const redirectUri = `${base}/api/migrations/oauth/google/callback`;
  const scope = encodeURIComponent("https://www.googleapis.com/auth/drive.readonly");
  const url =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&state=${encodeURIComponent(state)}` +
    `&access_type=offline` +
    `&prompt=consent`;

  return NextResponse.json({ url, state });
}
