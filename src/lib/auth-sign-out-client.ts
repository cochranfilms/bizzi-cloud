"use client";

import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

export const SIGNED_OUT_PATH = "/signed-out";

/**
 * Signs out Firebase and loads the signed-out confirmation with a full document navigation.
 * Avoids a blank screen from stale dashboard / team shell state after `signOut`.
 */
export async function completeSignOutWithConfirmation(): Promise<void> {
  try {
    await signOut(getFirebaseAuth());
  } catch (err) {
    console.error("[auth] signOut failed", err);
  }
  if (typeof window !== "undefined") {
    window.location.assign(SIGNED_OUT_PATH);
  }
}
