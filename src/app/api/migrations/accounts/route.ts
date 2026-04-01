import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { MIGRATION_PROVIDER_ACCOUNTS_COLLECTION, type MigrationProvider } from "@/lib/migration-constants";
import { deleteProviderAccount, providerAccountDocId } from "@/lib/migration-provider-account";
import { migrationRequireUid } from "@/lib/migration-require-auth";
import { logMigrationProviderDisconnected } from "@/lib/migration-log-activity";

export async function GET(request: Request) {
  const auth = await migrationRequireUid(request);
  if (auth instanceof NextResponse) return auth;

  const db = getAdminFirestore();
  const out: { provider: MigrationProvider; connected: boolean; provider_email: string | null }[] = [];
  for (const provider of ["google_drive", "dropbox"] as const) {
    const snap = await db
      .collection(MIGRATION_PROVIDER_ACCOUNTS_COLLECTION)
      .doc(providerAccountDocId(auth.uid, provider))
      .get();
    out.push({
      provider,
      connected: snap.exists,
      provider_email: (snap.data()?.provider_email as string | null) ?? null,
    });
  }
  return NextResponse.json({ accounts: out });
}

export async function DELETE(request: Request) {
  const auth = await migrationRequireUid(request);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") as MigrationProvider | null;
  if (provider !== "google_drive" && provider !== "dropbox") {
    return NextResponse.json({ error: "Invalid provider", code: "invalid_provider" }, { status: 400 });
  }
  const db = getAdminFirestore();
  await deleteProviderAccount(db, auth.uid, provider);
  logMigrationProviderDisconnected(auth.uid, provider);
  return NextResponse.json({ ok: true });
}
