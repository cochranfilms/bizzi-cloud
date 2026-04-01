export function googleMigrationClientId(): string {
  return (
    process.env.MIGRATION_GOOGLE_CLIENT_ID?.trim() ||
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() ||
    ""
  );
}

export function googleMigrationClientSecret(): string {
  return (
    process.env.MIGRATION_GOOGLE_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() ||
    ""
  );
}

export function dropboxMigrationAppKey(): string {
  return (
    process.env.MIGRATION_DROPBOX_APP_KEY?.trim() ||
    process.env.DROPBOX_APP_KEY?.trim() ||
    ""
  );
}

export function dropboxMigrationAppSecret(): string {
  return (
    process.env.MIGRATION_DROPBOX_APP_SECRET?.trim() ||
    process.env.DROPBOX_APP_SECRET?.trim() ||
    ""
  );
}

export function migrationOAuthRedirectBase(): string {
  const b = process.env.MIGRATION_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  return b.replace(/\/$/, "");
}
