/**
 * Handle (public_slug) for branded URLs: bizzicloud.io/{handle}/{gallery-slug}
 * Same username across personal and enterprise when same email.
 */

/** Path segments that must not be used as handles (reserved for app routes) */
export const RESERVED_HANDLES = new Set([
  "api",
  "dashboard",
  "desktop",
  "enterprise",
  "client",
  "login",
  "invite",
  "g",
  "p",
  "s",
  "t",
  "icon",
  "_next",
  "admin",
  "auth",
  "settings",
  "favicon.ico",
]);

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.toLowerCase().trim());
}
