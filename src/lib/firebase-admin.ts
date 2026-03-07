import { getApps, getApp, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export function getAuthConfigStatus(): {
  configured: boolean;
  projectId?: string;
  parseError?: string;
} {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw.trim() === "") {
    return { configured: false };
  }
  try {
    const parsed = JSON.parse(raw) as { project_id?: string };
    return { configured: true, projectId: parsed.project_id };
  } catch (e) {
    return {
      configured: true,
      parseError: e instanceof Error ? e.message : "Invalid JSON",
    };
  }
}

function getAdminApp() {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccount || serviceAccount.trim() === "") {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    }
    try {
      const parsed = JSON.parse(serviceAccount) as Parameters<typeof cert>[0];
      const storageBucket =
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
        (parsed as { project_id?: string }).project_id + ".appspot.com";
      initializeApp({
        credential: cert(parsed),
        storageBucket,
      });
    } catch (e) {
      const msg = e instanceof SyntaxError
        ? "FIREBASE_SERVICE_ACCOUNT_JSON has invalid JSON. Paste the full minified JSON from Firebase Console."
        : e instanceof Error ? e.message : "Failed to parse service account";
      throw new Error(msg);
    }
  }
  return getApp();
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}

export async function verifyIdToken(
  token: string
): Promise<{ uid: string; email?: string }> {
  const auth = getAuth(getAdminApp());
  const decoded = await auth.verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email };
}
