"use client";

import { useSubscription as useSubscriptionContext } from "@/context/SubscriptionContext";

export type { SubscriptionState } from "@/context/SubscriptionContext";

/**
 * Gallery Suite = gallery or fullframe addon
 * Editor (NLE) = editor or fullframe addon
 */
export function useSubscription() {
  return useSubscriptionContext();
}
