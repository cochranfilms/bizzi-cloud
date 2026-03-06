import { isB2Configured } from "@/lib/b2";
import { getAuthConfigStatus } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET() {
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

  return NextResponse.json({
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
  });
}
