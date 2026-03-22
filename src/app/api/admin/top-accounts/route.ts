/**
 * GET /api/admin/top-accounts
 * Returns top accounts by storage and revenue from real Firestore + Stripe data.
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { computeSubscriptionMrr } from "@/lib/stripe-mrr";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)));

  const db = getAdminFirestore();
  const authService = getAdminAuth();
  const stripe = getStripeInstance();

  const userIdToMrr: Record<string, number> = {};

  try {
    let hasMore = true;
    let lastId: string | undefined;

    while (hasMore) {
      const subs = await stripe.subscriptions.list({
        status: "active",
        expand: ["data.items.data.price"],
        limit: 100,
        ...(lastId ? { starting_after: lastId } : {}),
      });

      for (const sub of subs.data) {
        const userId = sub.metadata?.userId as string | undefined;
        if (!userId) continue;
        const subMrr = computeSubscriptionMrr(sub);
        userIdToMrr[userId] = (userIdToMrr[userId] ?? 0) + subMrr;
      }

      hasMore = subs.has_more;
      lastId = subs.data[subs.data.length - 1]?.id;
    }
  } catch (err) {
    console.error("[admin/top-accounts] Stripe error:", err);
  }

  const profilesSnap = await db.collection("profiles").get();
  const profiles = profilesSnap.docs.map((d) => ({
    id: d.id,
    plan_id: (d.data().plan_id as string) || "free",
    storage_used_bytes: (d.data().storage_used_bytes as number) ?? 0,
  }));

  const uids = profiles.map((p) => p.id);
  const authRecords = new Map<string, { email?: string; displayName?: string }>();
  for (let i = 0; i < uids.length; i += 100) {
    const batch = uids.slice(i, i + 100);
    try {
      const result = await authService.getUsers(batch.map((uid) => ({ uid })));
      for (const r of result.users) {
        authRecords.set(r.uid, {
          email: r.email,
          displayName: r.displayName ?? undefined,
        });
      }
    } catch (_) {}
  }

  const lastActiveByUser = new Map<string, string>();
  try {
    const activitySnap = await db
      .collection("activity_logs")
      .orderBy("created_at", "desc")
      .limit(3000)
      .get();
    for (const d of activitySnap.docs) {
      const uid = (d.data().actor_user_id as string) || "";
      if (uid && !lastActiveByUser.has(uid)) {
        const ts = d.data().created_at;
        const iso =
          ts && typeof ts === "object" && "toDate" in ts
            ? (ts as { toDate: () => Date }).toDate().toISOString()
            : typeof ts === "string"
              ? ts
              : null;
        if (iso) lastActiveByUser.set(uid, iso);
      }
    }
  } catch (_) {}

  const accounts = profiles.map((p) => ({
    id: p.id,
    plan: p.plan_id,
    storageUsedBytes: p.storage_used_bytes,
    revenueMonth: userIdToMrr[p.id] ?? 0,
    email: authRecords.get(p.id)?.email ?? "",
    displayName: authRecords.get(p.id)?.displayName ?? null,
  }));

  const byStorage = [...accounts]
    .filter((a) => a.storageUsedBytes > 0 || a.revenueMonth > 0)
    .sort((a, b) => b.storageUsedBytes - a.storageUsedBytes)
    .slice(0, limit);

  const topAccounts = byStorage.map((a) => ({
    id: a.id,
    name: a.displayName || a.email || "Unknown",
    email: a.email || "",
    plan: a.plan,
    storageUsedBytes: a.storageUsedBytes,
    revenueMonth: Math.round(a.revenueMonth * 100) / 100,
    lastActive: lastActiveByUser.get(a.id) ?? null,
  }));

  return NextResponse.json({ accounts: topAccounts });
}
