/**
 * One-off migration: backfill personal_teams, reconcile profile membership fields, emit report.
 * Run with: npx tsx scripts/migrate-personal-teams.ts
 *
 * Buckets: safe_migrated | inconsistent_needs_review | blocked_from_migration
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
function personalTeamSeatDocId(teamOwnerUid: string, memberUid: string): string {
  return `${teamOwnerUid}_${memberUid}`;
}

// Standalone script
const PERSONAL_TEAMS = "personal_teams";
const PERSONAL_TEAM_SEATS = "personal_team_seats";

function initAdmin() {
  if (getApps().length > 0) return;
  const svcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!svcPath) {
    throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path");
  }
  const raw = JSON.parse(readFileSync(resolve(svcPath), "utf8"));
  initializeApp({ credential: cert(raw) });
}

async function main() {
  initAdmin();
  const db = getFirestore();

  const safe_migrated: string[] = [];
  const inconsistent_needs_review: Array<{ uid: string; reason: string }> = [];
  const blocked_from_migration: Array<{ uid: string; reason: string }> = [];

  const profilesSnap = await db.collection("profiles").get();

  for (const doc of profilesSnap.docs) {
    const uid = doc.id;
    const data = doc.data();
    const pto = (data.personal_team_owner_id as string | undefined)?.trim();

    const hasTeamDrive = !(await db
      .collection("linked_drives")
      .where("userId", "==", uid)
      .where("personal_team_owner_id", "==", uid)
      .limit(1)
      .get()).empty;

    const seatsAsOwnerSnap = await db
      .collection(PERSONAL_TEAM_SEATS)
      .where("team_owner_user_id", "==", uid)
      .limit(1)
      .get();
    const hasSeatsAsOwner = !seatsAsOwnerSnap.empty;

    const teamRef = db.collection(PERSONAL_TEAMS).doc(uid);
    const teamExists = (await teamRef.get()).exists;

    if (hasTeamDrive || hasSeatsAsOwner) {
      if (!teamExists) {
        await teamRef.set({
          team_id: uid,
          owner_user_id: uid,
          status: "active",
          created_at: FieldValue.serverTimestamp(),
          migrated_at: FieldValue.serverTimestamp(),
        });
        safe_migrated.push(uid);
      }
    }

    if (pto) {
      const seatId = personalTeamSeatDocId(pto, uid);
      const seat = await db.collection(PERSONAL_TEAM_SEATS).doc(seatId).get();
      const st = seat.data()?.status as string | undefined;
      const ok = seat.exists && st === "active";
      if (!ok) {
        inconsistent_needs_review.push({
          uid,
          reason: `profile.personal_team_owner_id=${pto} but seat missing or not active`,
        });
      }
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    safe_migrated,
    inconsistent_needs_review,
    blocked_from_migration,
    counts: {
      safe_migrated: safe_migrated.length,
      inconsistent_needs_review: inconsistent_needs_review.length,
      blocked_from_migration: blocked_from_migration.length,
    },
  };

  const outPath = resolve(process.cwd(), "personal-teams-migration-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log("Wrote", outPath, report.counts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
