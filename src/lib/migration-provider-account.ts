import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  MIGRATION_PROVIDER_ACCOUNTS_COLLECTION,
  type MigrationProvider,
} from "@/lib/migration-constants";
import { decryptMigrationSecret, encryptMigrationSecret } from "@/lib/migration-token-crypto";
import { googleRefreshAccessToken } from "@/lib/migration-google-drive-api";
import { dropboxRefreshAccessToken } from "@/lib/migration-dropbox-api";

export function providerAccountDocId(uid: string, provider: MigrationProvider): string {
  return `${uid}_${provider}`;
}

export async function loadProviderRefreshToken(
  db: Firestore,
  uid: string,
  provider: MigrationProvider
): Promise<string | null> {
  const snap = await db
    .collection(MIGRATION_PROVIDER_ACCOUNTS_COLLECTION)
    .doc(providerAccountDocId(uid, provider))
    .get();
  if (!snap.exists) return null;
  const enc = snap.data()?.encrypted_refresh_token as string | undefined;
  if (!enc) return null;
  try {
    return decryptMigrationSecret(enc);
  } catch {
    return null;
  }
}

export async function getGoogleAccessToken(db: Firestore, uid: string): Promise<string> {
  const raw = await loadProviderRefreshToken(db, uid, "google_drive");
  if (!raw) throw new Error("Google Drive is not connected");
  const { access_token } = await googleRefreshAccessToken(raw);
  return access_token;
}

export async function getDropboxAccessToken(db: Firestore, uid: string): Promise<string> {
  const raw = await loadProviderRefreshToken(db, uid, "dropbox");
  if (!raw) throw new Error("Dropbox is not connected");
  const { access_token } = await dropboxRefreshAccessToken(raw);
  return access_token;
}

export async function saveProviderAccount(input: {
  db: Firestore;
  uid: string;
  provider: MigrationProvider;
  refreshToken: string;
  providerEmail?: string | null;
}): Promise<void> {
  const { db, uid, provider, refreshToken, providerEmail } = input;
  await db
    .collection(MIGRATION_PROVIDER_ACCOUNTS_COLLECTION)
    .doc(providerAccountDocId(uid, provider))
    .set(
      {
        user_id: uid,
        provider,
        encrypted_refresh_token: encryptMigrationSecret(refreshToken),
        provider_email: providerEmail ?? null,
        updated_at: FieldValue.serverTimestamp(),
        created_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

export async function deleteProviderAccount(
  db: Firestore,
  uid: string,
  provider: MigrationProvider
): Promise<void> {
  await db.collection(MIGRATION_PROVIDER_ACCOUNTS_COLLECTION).doc(providerAccountDocId(uid, provider)).delete();
}
