import { getAdminFirestore } from "@/lib/firebase-admin";

export type TransferManagementDoc = {
  user_id?: string;
  userId?: string;
  organization_id?: string | null;
  personal_team_owner_id?: string | null;
};

/** Same rules as gallery team scope: creator, team owner, or active seat on the container. */
export async function userCanManageTransfer(uid: string, data: TransferManagementDoc): Promise<boolean> {
  const creator = (data.user_id ?? data.userId) as string | undefined;
  if (creator === uid) return true;

  const orgId = data.organization_id;
  if (orgId != null && String(orgId).trim() !== "") return false;

  const ptoRaw = data.personal_team_owner_id;
  const pto = typeof ptoRaw === "string" && ptoRaw.trim() ? ptoRaw.trim() : null;
  if (!pto) return false;
  if (uid === pto) return true;

  const db = getAdminFirestore();
  const seatSnap = await db.collection("personal_team_seats").doc(`${pto}_${uid}`).get();
  const st = seatSnap.data()?.status as string | undefined;
  return seatSnap.exists && (st === "active" || st === "cold_storage");
}
