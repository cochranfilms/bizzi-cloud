import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { MIGRATION_OAUTH_STATES_COLLECTION } from "@/lib/migration-constants";
import { migrationRequireUid } from "@/lib/migration-require-auth";
import {
  MIGRATION_OAUTH_DEFAULT_RETURN,
  sanitizeMigrationOAuthReturnPath,
} from "@/lib/migration-oauth-return-path";
import { dropboxMigrationAppKey, migrationOAuthRedirectBase } from "@/lib/migration-oauth-env";
import { checkRateLimit } from "@/lib/rate-limit";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export async function POST(request: Request) {
  const auth = await migrationRequireUid(request);
  if (auth instanceof NextResponse) return auth;

  const rl = checkRateLimit(`migration_oauth_dropbox:${auth.uid}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", code: "rate_limited" }, { status: 429 });
  }

  const appKey = dropboxMigrationAppKey();
  if (!appKey) {
    return NextResponse.json(
      { error: "Dropbox migration OAuth not configured", code: "oauth_not_configured" },
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
    provider: "dropbox",
    return_path: returnPath,
    created_at: FieldValue.serverTimestamp(),
    expires_at: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
  });

  const redirectUri = `${base}/api/migrations/oauth/dropbox/callback`;
  const scope = encodeURIComponent("files.metadata.read files.content.read");
  const url =
    `https://www.dropbox.com/oauth2/authorize` +
    `?client_id=${encodeURIComponent(appKey)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&token_access_type=offline` +
    `&scope=${scope}`;

  return NextResponse.json({ url, state });
}
