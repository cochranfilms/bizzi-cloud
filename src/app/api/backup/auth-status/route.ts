import { NextResponse } from "next/server";
import { getAuthConfigStatus } from "@/lib/firebase-admin";

export async function GET() {
  const status = getAuthConfigStatus();
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const mismatch =
    status.projectId &&
    clientProjectId &&
    status.projectId !== clientProjectId;

  return NextResponse.json({
    ...status,
    clientProjectId: clientProjectId ?? null,
    projectMismatch: mismatch,
    hint: !status.configured
      ? "Set FIREBASE_SERVICE_ACCOUNT_JSON in Vercel (full JSON from Firebase Console)."
      : status.parseError
        ? "Fix the JSON: ensure it's valid, minified, with escaped newlines in private_key."
        : mismatch
          ? "Project mismatch: FIREBASE_SERVICE_ACCOUNT_JSON project_id must match NEXT_PUBLIC_FIREBASE_PROJECT_ID."
          : null,
  });
}
