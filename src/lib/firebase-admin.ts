import { getApps, getApp, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getAdminApp() {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccount) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    }
    initializeApp({
      credential: cert(JSON.parse(serviceAccount) as Parameters<typeof cert>[0]),
    });
  }
  return getApp();
}

export async function verifyIdToken(
  token: string
): Promise<{ uid: string; email?: string }> {
  const auth = getAuth(getAdminApp());
  const decoded = await auth.verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email };
}
