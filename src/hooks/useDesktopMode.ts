"use client";

import { usePathname } from "next/navigation";

/**
 * Returns true when the app is running in desktop mode (/desktop routes).
 * Used to enable Stripe read-only, hide upgrade flows, and show NLE Mount panel.
 */
export function useDesktopMode(): boolean {
  const pathname = usePathname();
  return pathname?.startsWith("/desktop") ?? false;
}
