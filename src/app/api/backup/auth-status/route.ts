import { isB2Configured, objectExists } from "@/lib/b2";
import { getAuthConfigStatus, getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const status = getAuthConfigStatus();
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const mismatch =
    status.projectId &&
    clientProjectId &&
    status.projectId !== clientProjectId;

  const b2Configured = isB2Configured();
  const b2Hint = !b2Configured
    ? "Set B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY, B2_BUCKET_NAME, B2_ENDPOINT in Vercel (Backblaze B2 Console)."
    : null;

  const url = new URL(request.url);
  const runConnectivityTests = url.searchParams.get("test") === "1";

  const result: Record<string, unknown> = {
    ...status,
    clientProjectId: clientProjectId ?? null,
    projectMismatch: mismatch,
    b2Configured,
    b2Hint,
    hint: !status.configured
      ? "Set FIREBASE_SERVICE_ACCOUNT_JSON in Vercel (full JSON from Firebase Console)."
      : status.parseError
        ? status.parseError.includes("minus sign")
          ? "The private_key value is unquoted or broken. Paste the ENTIRE JSON from the downloaded file—don't edit it. In the .json file, private_key must be a quoted string with \\n for newlines."
          : "Fix the JSON: ensure it's valid, minified, with escaped newlines in private_key."
        : mismatch
          ? "Project mismatch: FIREBASE_SERVICE_ACCOUNT_JSON project_id must match NEXT_PUBLIC_FIREBASE_PROJECT_ID."
          : null,
  };

  if (runConnectivityTests) {
    const tests: Record<string, { ok: boolean; error?: string }> = {};

    if (b2Configured) {
      try {
        await objectExists("__diagnostic-nonexistent__");
        tests.b2 = { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        tests.b2 = { ok: false, error: msg };
      }
    }

    if (status.configured && !status.parseError) {
      try {
        getAdminFirestore();
        tests.firebase_init = { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        tests.firebase_init = { ok: false, error: msg };
      }
    }

    result.connectivityTests = tests;
  }

  return NextResponse.json(result);
}
