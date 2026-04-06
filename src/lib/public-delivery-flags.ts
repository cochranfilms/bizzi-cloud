/** Client-build flags (NEXT_PUBLIC_*), kept separate from server-only delivery env. */

export const NEXT_PUBLIC_ASSET_PREVIEW_CONSOLIDATED_ENABLED =
  process.env.NEXT_PUBLIC_ASSET_PREVIEW_CONSOLIDATED === "true";
