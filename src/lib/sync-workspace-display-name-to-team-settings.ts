/**
 * Copies `profiles…workspace_onboarding.workspace_display_name` → `personal_team_settings.team_name`
 * **only** when the owner already has `personal_teams/{uid}` and `team_name` is still empty.
 *
 * Until then, the wizard keeps the preferred label in the profile blob only; after copy (or
 * after complete POST writes both), `team_name` is the teammate-facing source of truth in settings.
 */
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { PERSONAL_TEAM_SETTINGS_COLLECTION } from "@/lib/personal-team-constants";
import { userOwnsPersonalTeamRecord } from "@/lib/personal-team-auth";
import { parseWorkspaceOnboardingFromProfile } from "@/lib/workspace-onboarding";

export async function copyWorkspaceDisplayNameToTeamSettingsIfEmpty(
  db: Firestore,
  ownerUid: string
): Promise<boolean> {
  if (!(await userOwnsPersonalTeamRecord(db, ownerUid))) return false;

  const profileSnap = await db.collection("profiles").doc(ownerUid).get();
  const { onboarding } = parseWorkspaceOnboardingFromProfile(
    profileSnap.data() as Record<string, unknown> | undefined
  );
  const displayName = (onboarding.workspace_display_name ?? "").trim();
  if (displayName.length < 2) return false;

  const settingsRef = db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(ownerUid);
  const settingsSnap = await settingsRef.get();
  const existing = ((settingsSnap.data()?.team_name as string) ?? "").trim();
  if (existing.length > 0) return false;

  await settingsRef.set(
    {
      team_owner_id: ownerUid,
      team_name: displayName,
      updated_at: FieldValue.serverTimestamp(),
      ...(settingsSnap.exists ? {} : { created_at: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );
  return true;
}
