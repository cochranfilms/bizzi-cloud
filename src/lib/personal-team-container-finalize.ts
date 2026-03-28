/**
 * Full personal team container shutdown: snapshot seats, migrate team files to cold storage,
 * clear member and owner team fields, remove seat docs, set owner team lifecycle metadata.
 */
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { migratePersonalTeamContainerToColdStorage } from "@/lib/cold-storage-migrate";
import { hasColdStorage } from "@/lib/cold-storage-restore";
import type { ColdStorageSourceType } from "@/lib/cold-storage-retention";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team";
import { PERSONAL_TEAMS_COLLECTION } from "@/lib/personal-team-constants";
import { writeAuditLog } from "@/lib/audit-log";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getRetentionDays } from "@/lib/cold-storage-retention";
import { sendTeamRecoveryStorageEmail } from "@/lib/emailjs";

export interface FinalizePersonalTeamColdStorageParams {
  teamOwnerUserId: string;
  sourceType: ColdStorageSourceType;
  auditTrigger: string;
}

export interface FinalizePersonalTeamColdStorageResult {
  teamOwnerUserId: string;
  skipped: boolean;
  migrated: number;
  message?: string;
}

export async function finalizePersonalTeamColdStorage(
  params: FinalizePersonalTeamColdStorageParams
): Promise<FinalizePersonalTeamColdStorageResult> {
  const { teamOwnerUserId, sourceType, auditTrigger } = params;
  const db = getAdminFirestore();
  const ownerRef = db.collection("profiles").doc(teamOwnerUserId);
  const ownerSnap = await ownerRef.get();
  const ownerData = ownerSnap.data();
  const planTier = (ownerData?.plan_id as string) ?? "solo";

  const seatsSnap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .where("team_owner_user_id", "==", teamOwnerUserId)
    .get();

  const teamLife = (ownerData?.team_storage_lifecycle_status as string) ?? "active";
  if (teamLife === "cold_storage" && seatsSnap.empty) {
    return {
      teamOwnerUserId,
      skipped: true,
      migrated: 0,
      message: "already_finalized",
    };
  }

  if (!seatsSnap.empty) {
    let ownerEmail = "";
    try {
      const r = await getAdminAuth().getUser(teamOwnerUserId);
      ownerEmail = (r.email ?? "").trim().toLowerCase();
    } catch {
      /* ignore */
    }
    const snapshotData = {
      team_owner_user_id: teamOwnerUserId,
      owner_email: ownerEmail,
      created_at: Timestamp.now(),
      seats: seatsSnap.docs.map((d) => {
        const data = d.data();
        return {
          member_user_id: data.member_user_id,
          seat_access_level: data.seat_access_level,
          invited_email: data.invited_email ?? null,
          status: data.status,
        };
      }),
    };
    await db.collection("cold_storage_team_snapshots").doc(teamOwnerUserId).set(snapshotData);
  }

  let migrated = 0;
  try {
    const result = await migratePersonalTeamContainerToColdStorage(
      teamOwnerUserId,
      sourceType,
      planTier
    );
    migrated = result.migrated;
  } catch (err) {
    console.error("[finalizePersonalTeamColdStorage] migrate failed", teamOwnerUserId, err);
    throw err;
  }

  const memberUids = new Set<string>();
  for (const d of seatsSnap.docs) {
    const mid = d.data().member_user_id as string | undefined;
    if (mid) memberUids.add(mid);
  }
  for (const mid of memberUids) {
    await db
      .collection("profiles")
      .doc(mid)
      .set(
        {
          personal_team_owner_id: FieldValue.delete(),
          personal_team_seat_access: FieldValue.delete(),
        },
        { merge: true }
      );
  }

  for (const s of seatsSnap.docs) {
    await s.ref.delete();
  }

  await db.collection(PERSONAL_TEAMS_COLLECTION).doc(teamOwnerUserId).set(
    {
      status: "cold_storage",
      cold_storage_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const retentionDays = getRetentionDays(planTier, sourceType);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + retentionDays);

  await ownerRef.set(
    {
      team_storage_lifecycle_status: "cold_storage",
      team_cold_storage_started_at: FieldValue.serverTimestamp(),
      team_cold_storage_expires_at: Timestamp.fromDate(expiresAt),
      team_restore_status: FieldValue.delete(),
      team_restore_invoice_url: FieldValue.delete(),
    },
    { merge: true }
  );

  await writeAuditLog({
    action: "personal_team_cold_storage_finalized",
    uid: teamOwnerUserId,
    metadata: { auditTrigger, migrated, sourceType },
  });

  let ownerNotifyEmail = "";
  try {
    const r = await getAdminAuth().getUser(teamOwnerUserId);
    ownerNotifyEmail = (r.email ?? "").trim().toLowerCase();
  } catch {
    /* ignore */
  }
  if (ownerNotifyEmail) {
    const expStr = expiresAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (typeof process.env.VERCEL_URL === "string"
        ? `https://${process.env.VERCEL_URL}`
        : null) ??
      "https://www.bizzicloud.io";
    sendTeamRecoveryStorageEmail({
      to_email: ownerNotifyEmail,
      expires_date: expStr,
      support_url: `${baseUrl}/support`,
    }).catch((err) =>
      console.error("[finalizePersonalTeamColdStorage] recovery email failed", teamOwnerUserId, err)
    );
  }

  return { teamOwnerUserId, skipped: false, migrated };
}

/** True if team owner has team cold rows or lifecycle says cold_storage. */
export async function hasPersonalTeamColdStorage(teamOwnerUserId: string): Promise<boolean> {
  if (await hasColdStorage({ teamOwnerUserId })) return true;
  const snap = await getAdminFirestore()
    .collection("profiles")
    .doc(teamOwnerUserId)
    .get();
  return (snap.data()?.team_storage_lifecycle_status as string | undefined) === "cold_storage";
}
