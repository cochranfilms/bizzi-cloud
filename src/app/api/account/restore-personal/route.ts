/**
 * POST /api/account/restore-personal
 * Restore personal workspace from scheduled delete (within grace period).
 * User must be authenticated. Preserves enterprise memberships.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { restoreColdStorageToHot } from "@/lib/cold-storage-restore";
import { restorePersonalToActive } from "@/lib/storage-lifecycle";
import type { PersonalStatus } from "@/types/profile";
import { NextResponse } from "next/server";

const RECOVERABLE_STATUSES: PersonalStatus[] = ["scheduled_delete", "recoverable"];

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();

  if (!profileSnap.exists || !profileData) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const personalStatus = (profileData.personal_status as PersonalStatus | undefined) ?? "active";
  const restoreUntil = profileData.personal_restore_available_until?.toDate?.();

  if (!RECOVERABLE_STATUSES.includes(personalStatus)) {
    return NextResponse.json(
      {
        error:
          personalStatus === "purged"
            ? "Your personal account has been permanently purged and cannot be restored."
            : "Your personal account is active. Nothing to restore.",
      },
      { status: 400 }
    );
  }

  const now = new Date();
  if (restoreUntil && restoreUntil <= now) {
    return NextResponse.json(
      {
        error:
          "The restoration period has expired. Your personal data has been purged.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await restoreColdStorageToHot({
      type: "consumer",
      userId: uid,
    });

    await restorePersonalToActive({ userId: uid });

    return NextResponse.json({
      ok: true,
      message: "Your personal account has been restored.",
      restored: result.restored,
      drivesCreated: result.drivesCreated,
    });
  } catch (err) {
    console.error("[restore-personal] Failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Restore failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
