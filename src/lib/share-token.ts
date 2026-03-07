import { randomBytes } from "crypto";

/** Generate a URL-safe token for share links (e.g. 21 bytes -> ~28 chars). */
export function generateShareToken(): string {
  return randomBytes(21).toString("base64url");
}
