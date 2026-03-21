/**
 * POST /api/account/delete
 * Cold-storage account deletion: files move to cold storage for 30 days.
 * Profile and Firebase Auth retained for 30 days so user can resubscribe and restore.
 * Requires confirmation in body.
 * Body: { confirmation: "DELETE" }
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, getClientIp } from "@/lib/audit-log";
import { migrateAccountDeleteToColdStorage } from "@/lib/cold-storage-migrate";
import { transitionToScheduledDelete } from "@/lib/storage-lifecycle";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

const BATCH_SIZE = 500;
const RETENTION_DAYS = 30;

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

  const rl = checkRateLimit(`delete:${uid}`, 3, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Too many attempts. Try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rl.resetAt - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  let body: { confirmation?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (body.confirmation !== "DELETE") {
    return NextResponse.json(
      {
        error:
          'Confirmation required. Send { "confirmation": "DELETE" } to proceed.',
      },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();
  const stripeSubscriptionId = profileData?.stripe_subscription_id as
    | string
    | undefined;
  const addonIds = (profileData?.addon_ids as string[] | undefined) ?? [];
  const requiredAddonIds = addonIds.filter((id) =>
    ["gallery", "editor", "fullframe"].includes(id)
  );

  // Compute total bytes used and store restore requirements BEFORE we clear profile/migrate
  let totalBytesUsed = 0;
  const backupFilesSnap = await db
    .collection("backup_files")
    .where("userId", "==", uid)
    .where("organization_id", "==", null)
    .get();
  for (const d of backupFilesSnap.docs) {
    totalBytesUsed += (d.data().size_bytes as number) ?? 0;
  }

  const now = new Date();
  const effectiveAt = new Date(now);
  effectiveAt.setDate(effectiveAt.getDate() + RETENTION_DAYS);

  // 1. Transition to scheduled_delete (narrow scope: account deletion only)
  await transitionToScheduledDelete({
    userId: uid,
    requestedAt: now,
    effectiveAt,
  });

  // 2. Cancel Stripe subscription immediately (stops future billing)
  if (stripeSubscriptionId) {
    try {
      const stripe = getStripeInstance();
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      if (!sub.cancel_at_period_end && !sub.canceled_at) {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      }
    } catch (err) {
      console.error(
        "[account-delete] Stripe cancel failed for user",
        uid,
        err
      );
    }
  }

  // 3. Migrate backup_files to cold_storage (30-day retention)
  try {
    const result = await migrateAccountDeleteToColdStorage(uid);
    console.log(
      "[account-delete] Migrated user",
      uid,
      "to cold storage, files:",
      result.migrated
    );
  } catch (err) {
    console.error("[account-delete] Cold storage migration failed:", err);
    return NextResponse.json(
      { error: "Migration failed. Please try again." },
      { status: 500 }
    );
  }

  // 3b. Store restore requirements so change-plan can enforce min storage and required addons
  await db.collection("cold_storage_restore_requirements").doc(uid).set({
    total_bytes_used: totalBytesUsed,
    required_addon_ids: requiredAddonIds,
    source_type: "account_delete",
    created_at: now.toISOString(),
  });

  // 4. Delete other user data (keep profile and Firebase Auth)
  const deleteByQuery = async (
    collection: string,
    field: string,
    value: string
  ) => {
    let done = false;
    while (!done) {
      const snap = await db
        .collection(collection)
        .where(field, "==", value)
        .limit(BATCH_SIZE)
        .get();
      if (snap.empty) {
        done = true;
        break;
      }
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  };

  // Galleries and related data
  const galleriesSnap = await db
    .collection("galleries")
    .where("photographer_id", "==", uid)
    .get();
  const galleryIds = galleriesSnap.docs.map((d) => d.id);

  for (let i = 0; i < galleryIds.length; i += 10) {
    const batch = galleryIds.slice(i, i + 10);
    const assetsSnap = await db
      .collection("gallery_assets")
      .where("gallery_id", "in", batch)
      .get();
    for (let j = 0; j < assetsSnap.docs.length; j += BATCH_SIZE) {
      const chunk = assetsSnap.docs.slice(j, j + BATCH_SIZE);
      const batchWrite = db.batch();
      chunk.forEach((d) => batchWrite.delete(d.ref));
      await batchWrite.commit();
    }
  }

  for (const gid of galleryIds) {
    const listsSnap = await db
      .collection("favorites_lists")
      .where("gallery_id", "==", gid)
      .get();
    for (let j = 0; j < listsSnap.docs.length; j += BATCH_SIZE) {
      const chunk = listsSnap.docs.slice(j, j + BATCH_SIZE);
      const batchWrite = db.batch();
      chunk.forEach((d) => batchWrite.delete(d.ref));
      await batchWrite.commit();
    }
  }

  await deleteByQuery("pinned_items", "userId", uid);
  await deleteByQuery("local_store_entries", "user_id", uid);
  await deleteByQuery("devices", "user_id", uid);
  await deleteByQuery("notifications", "recipientUserId", uid);
  await deleteByQuery("folder_shares", "owner_id", uid);

  const transfersSnap = await db.collection("transfers").where("user_id", "==", uid).get();
  for (const d of transfersSnap.docs) {
    await d.ref.delete();
  }

  for (const d of galleriesSnap.docs) {
    await d.ref.delete();
  }

  await deleteByQuery("organization_seats", "user_id", uid);

  // Clear organization_id / organization_role from profile if present
  await db
    .collection("profiles")
    .doc(uid)
    .update({
      organization_id: FieldValue.delete(),
      organization_role: FieldValue.delete(),
    });

  await writeAuditLog({
    action: "account_delete_requested",
    uid,
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") ?? null,
  });

  const formattedDate = effectiveAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return NextResponse.json({
    ok: true,
    message: `Your account is scheduled for permanent deletion on ${formattedDate}. Until then, your files remain recoverable. Log back in and resubscribe to restore them.`,
  });
}
