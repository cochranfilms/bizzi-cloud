/**
 * Locked uniqueness rules: trim outer whitespace, NFC Unicode, case-insensitive compare key.
 */
export function trimDisplayName(input: string): string {
  return input.trim();
}

export function toNormalizedComparisonKey(displayName: string): string {
  const t = trimDisplayName(displayName);
  if (!t) return "";
  return t.normalize("NFC").toLowerCase();
}
