/**
 * Normalize Firestore Timestamp | string | Date for API JSON responses.
 */
export function firestoreDateToIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
    } catch {
      /* ignore */
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}
