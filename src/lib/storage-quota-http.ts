import { StorageQuotaDeniedError } from "@/lib/storage-quota-denied-error";

/** JSON body for 403 storage quota responses (and 500 unhandled should not use this). */
export function storageQuotaErrorJson(err: unknown): {
  status: number;
  body: Record<string, unknown>;
} | null {
  if (err instanceof StorageQuotaDeniedError) {
    return {
      status: 403,
      body: {
        error: err.message,
        storage_denial: err.storage_denial,
      },
    };
  }
  return null;
}
