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
import { Timestamp } from "firebase-admin/firestore";
import { aggregateActiveBackupFileMetrics } from "@/lib/admin-backup-file-metrics";

const VALID_PLANS: PlanId[] = ["free", "solo", "indie", "video", "production"];
const BATCH_SIZE = 100;

function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

function workspaceCompletedAtToIso(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v;
  if (
    v != null &&
    typeof v === "object" &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function workspaceOnboardingFromProfile(data: Record<string, unknown>): {
  status: "pending" | "completed" | null;
  version: number | null;
  completedAt: string | null;
  workspaceDisplayName: string | null;
  collaborationMode: string | null;
  teamType: string | null;
  useCase: string | null;
  preferredPerformanceRegion: string | null;
} {
  const st = data.workspace_onboarding_status;
  const status =
    st === "pending" || st === "completed" ? (st as "pending" | "completed") : null;
  const ver = data.workspace_onboarding_version;
  const version = typeof ver === "number" && Number.isFinite(ver) ? ver : null;
  const completedAt = workspaceCompletedAtToIso(data.workspace_onboarding_completed_at);
  const wo = data.workspace_onboarding;
  const blob =
    wo && typeof wo === "object" && !Array.isArray(wo)
      ? (wo as Record<string, unknown>)
      : {};
  return {
    status,
    version,
    completedAt,
    workspaceDisplayName:
      typeof blob.workspace_display_name === "string" ? blob.workspace_display_name : null,
    collaborationMode:
      typeof blob.collaboration_mode === "string" ? blob.collaboration_mode : null,
    teamType: typeof blob.team_type === "string" ? blob.team_type : null,
    useCase: typeof blob.use_case === "string" ? blob.use_case : null,
    preferredPerformanceRegion:
      typeof blob.preferred_performance_region === "string"
        ? blob.preferred_performance_region
        : null,
  };
}

function activityTsToIso(ts: unknown): string | null {
  if (
    ts != null &&
    typeof ts === "object" &&
    "toDate" in ts &&
    typeof (ts as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      return (ts as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof ts === "string") return ts;
  return null;
}

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
  const authRecords = new Map<
    string,
    { email?: string; displayName?: string; createdAt?: string; lastSignInTime?: string }
  >();

  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = uids.slice(i, i + BATCH_SIZE);
    try {
      const result = await authService.getUsers(batch.map((uid) => ({ uid })));
      for (const r of result.users) {
        authRecords.set(r.uid, {
          email: r.email,
          displayName: r.displayName ?? undefined,
          createdAt: r.metadata?.creationTime,
          lastSignInTime: r.metadata?.lastSignInTime,
        });
      }
    } catch (err) {
      console.error("[admin/users] getUsers batch error:", err);
    }
  }

  const [metrics, activitySnap, uploadsSnap] = await Promise.all([
    aggregateActiveBackupFileMetrics(db),
    (async () => {
      try {
        const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return await db.collection("activity_logs").where("created_at", ">=", cutoff).get();
      } catch (err) {
        console.warn("[admin/users] activity_logs query failed:", err);
        return null;
      }
    })(),
    (async () => {
      try {
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        return await db
          .collection("upload_sessions")
          .where("createdAt", ">=", monthStart.toISOString())
          .get();
      } catch (err) {
        console.warn("[admin/users] upload_sessions query failed:", err);
        return null;
      }
    })(),
  ]);

  const lastActivityByUser = new Map<string, string>();
  if (activitySnap) {
    for (const d of activitySnap.docs) {
      const uid = (d.data().actor_user_id as string) || "";
      if (!uid) continue;
      const iso = activityTsToIso(d.data().created_at);
      if (!iso) continue;
      const prev = lastActivityByUser.get(uid);
      if (!prev || iso > prev) lastActivityByUser.set(uid, iso);
    }
  }

  const uploadsThisMonthByUser = new Map<string, number>();
  if (uploadsSnap) {
    for (const d of uploadsSnap.docs) {
      const uid = d.data().userId as string | undefined;
      if (!uid) continue;
      uploadsThisMonthByUser.set(uid, (uploadsThisMonthByUser.get(uid) ?? 0) + 1);
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
    workspaceOnboarding: ReturnType<typeof workspaceOnboardingFromProfile>;
  }> = profiles.map((p) => {
    const row = p as ProfileRow;
    const planId = (row.plan_id as string) || "free";
    const authRec = authRecords.get(row.id);
    const raw = p as Record<string, unknown>;

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
      lastActive: laterIso(
        lastActivityByUser.get(row.id),
        authRec?.lastSignInTime
      ),
      totalFiles: metrics.fileCountByUser.get(row.id) ?? 0,
      uploadsThisMonth: uploadsThisMonthByUser.get(row.id) ?? 0,
      revenueGenerated: Math.round((userIdToMrr[row.id] ?? 0) * 100) / 100,
      supportFlags: [],
      signupDate: authRec?.createdAt ?? new Date().toISOString(),
      addonIds: Array.isArray(row.addon_ids) ? row.addon_ids : [],
      workspaceOnboarding: workspaceOnboardingFromProfile(raw),
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
