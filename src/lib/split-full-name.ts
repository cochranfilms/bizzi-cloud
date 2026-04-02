/**
 * Split a display name for HubSpot firstname / lastname.
 * First contiguous word → firstname; remainder → lastname (may be empty).
 */
export function splitFullName(fullName: string): { firstname: string; lastname: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstname: "", lastname: "" };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { firstname: trimmed, lastname: "" };
  return {
    firstname: trimmed.slice(0, space).trim(),
    lastname: trimmed.slice(space + 1).trim(),
  };
}
