import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { MIGRATION_OAUTH_STATES_COLLECTION } from "@/lib/migration-constants";
import { saveProviderAccount } from "@/lib/migration-provider-account";
import { logMigrationProviderConnected } from "@/lib/migration-log-activity";
import {
  migrationOAuthAbsoluteRedirect,
  MIGRATION_OAUTH_DEFAULT_RETURN,
  sanitizeMigrationOAuthReturnPath,
} from "@/lib/migration-oauth-return-path";
import {
  dropboxMigrationAppKey,
  dropboxMigrationAppSecret,
  migrationOAuthRedirectBase,
} from "@/lib/migration-oauth-env";
import { Timestamp } from "firebase-admin/firestore";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const base = migrationOAuthRedirectBase() || "";
  const redirectWith = (returnPath: string, query: Record<string, string>) =>
    NextResponse.redirect(migrationOAuthAbsoluteRedirect(base, returnPath, query));

  if (err) {
    return redirectWith(MIGRATION_OAUTH_DEFAULT_RETURN, { oauth_error: err });
  }
  if (!code || !state) {
    return redirectWith(MIGRATION_OAUTH_DEFAULT_RETURN, { oauth_error: "missing_params" });
  }

  const db = getAdminFirestore();
  const stateRef = db.collection(MIGRATION_OAUTH_STATES_COLLECTION).doc(state);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists) {
    return redirectWith(MIGRATION_OAUTH_DEFAULT_RETURN, { oauth_error: "invalid_state" });
  }
  const st = stateSnap.data()!;
  const returnPath = sanitizeMigrationOAuthReturnPath(st.return_path);
  const exp = st.expires_at as Timestamp | undefined;
  if (exp && exp.toMillis() < Date.now()) {
    await stateRef.delete().catch(() => {});
    return redirectWith(returnPath, { oauth_error: "state_expired" });
  }
  const uid = st.uid as string;

  const appKey = dropboxMigrationAppKey();
  const appSecret = dropboxMigrationAppSecret();
  if (!appKey || !appSecret) {
    return redirectWith(returnPath, { oauth_error: "server_misconfigured" });
  }

  const redirectUri = `${base}/api/migrations/oauth/dropbox/callback`;
  const basic = Buffer.from(`${appKey}:${appSecret}`).toString("base64");
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const tokRes = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const tokJson = (await tokRes.json()) as Record<string, unknown>;
  if (!tokRes.ok) {
    await stateRef.delete().catch(() => {});
    const msg =
      typeof tokJson.error_description === "string"
        ? tokJson.error_description
        : "token_failed";
    return redirectWith(returnPath, { oauth_error: msg });
  }
  const refresh = tokJson.refresh_token as string | undefined;
  if (!refresh) {
    await stateRef.delete().catch(() => {});
    return redirectWith(returnPath, { oauth_error: "no_refresh_token" });
  }

  await saveProviderAccount({
    db,
    uid,
    provider: "dropbox",
    refreshToken: refresh,
    providerEmail: (tokJson.account_id as string) ?? null,
  });
  logMigrationProviderConnected(uid, "dropbox");
  await stateRef.delete().catch(() => {});
  return redirectWith(returnPath, { connected: "dropbox" });
}
