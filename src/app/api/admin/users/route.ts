/**
 * GET /api/admin/users
 * Returns real users from Firestore profiles + Firebase Auth + Stripe.
 * Supports search, plan filter, pagination.
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import type { PlanId } from "@/lib/plan-constants";
import { computeSubscriptionMrr } from "@/lib/stripe-mrr";

const VALID_PLANS: PlanId[] = ["free", "solo", "indie", "video", "production"];
const BATCH_SIZE = 100;

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)));
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();
  const planFilter = searchParams.get("plan") ?? "";

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
        const uid = sub.metadata?.userId as string | undefined;
        if (!uid) continue;
        const mrr = computeSubscriptionMrr(sub);
        userIdToMrr[uid] = (userIdToMrr[uid] ?? 0) + mrr;
      }
      hasMore = subs.has_more;
      lastId = subs.data[subs.data.length - 1]?.id;
    }
  } catch (err) {
    console.error("[admin/users] Stripe error:", err);
  }

  const profilesSnap = await db.collection("profiles").get();
  const profiles = profilesSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  // Batch fetch auth records for UIDs (Firebase allows max 100 per getUsers)
  const uids = [...new Set(profiles.map((p) => p.id))];
  const authRecords = new Map<string, { email?: string; displayName?: string; createdAt?: string }>();

  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = uids.slice(i, i + BATCH_SIZE);
    try {
      const result = await authService.getUsers(batch.map((uid) => ({ uid })));
      for (const r of result.users) {
        authRecords.set(r.uid, {
          email: r.email,
          displayName: r.displayName ?? undefined,
          createdAt: r.metadata?.creationTime,
        });
      }
    } catch (err) {
      console.error("[admin/users] getUsers batch error:", err);
    }
  }

  type ProfileRow = {
    id: string;
    plan_id?: string;
    storage_used_bytes?: number;
    storage_quota_bytes?: number;
    addon_ids?: string[];
    organization_id?: string;
    stripe_subscription_id?: string | null;
  };

  let users: Array<{
    id: string;
    email: string;
    displayName: string | null;
    plan: string;
    status: "active" | "suspended" | "trial" | "churned";
    storageUsedBytes: number;
    lastActive: string | null;
    totalFiles: number;
    uploadsThisMonth: number;
    revenueGenerated: number;
    supportFlags: string[];
    signupDate: string;
    addonIds: string[];
  }> = profiles.map((p) => {
    const row = p as ProfileRow;
    const planId = (row.plan_id as string) || "free";
    const authRec = authRecords.get(row.id);

    return {
      id: row.id,
      email: authRec?.email ?? "",
      displayName: authRec?.displayName ?? null,
      plan: VALID_PLANS.includes(planId as PlanId) ? planId : planId,
      status: "active" as const,
      storageUsedBytes:
        typeof row.storage_used_bytes === "number"
          ? row.storage_used_bytes
          : 0,
      lastActive: null,
      totalFiles: 0,
      uploadsThisMonth: 0,
      revenueGenerated: Math.round((userIdToMrr[row.id] ?? 0) * 100) / 100,
      supportFlags: [],
      signupDate: authRec?.createdAt ?? new Date().toISOString(),
      addonIds: Array.isArray(row.addon_ids) ? row.addon_ids : [],
    };
  });

  if (search) {
    users = users.filter(
      (u) =>
        u.email.toLowerCase().includes(search) ||
        (u.displayName?.toLowerCase().includes(search) ?? false)
    );
  }
  if (planFilter) {
    users = users.filter((u) => u.plan === planFilter);
  }

  const total = users.length;
  const start = (page - 1) * limit;
  const paginated = users.slice(start, start + limit);

  return NextResponse.json({
    users: paginated,
    total,
    page,
    limit,
  });
}
