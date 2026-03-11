/**
 * GET /api/admin/alerts
 * Returns derived alerts from real platform data (storage near limit, etc.).
 * No dedicated alerts collection - we derive from profiles and Stripe.
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const severity = searchParams.get("severity") ?? "";
  const limitParam = searchParams.get("limit") ?? "20";
  const limit = Math.min(50, Math.max(1, parseInt(limitParam, 10)));

  const db = getAdminFirestore();
  const authService = getAdminAuth();
  const alerts: Array<{
    id: string;
    severity: "critical" | "warning" | "info";
    title: string;
    source: string;
    timestamp: string;
    targetUserId?: string;
    suggestedCause?: string;
    recommendedAction?: string;
  }> = [];

  const profilesSnap = await db.collection("profiles").get();
  const now = new Date().toISOString();

  const storageAlertUids: string[] = [];
  for (const d of profilesSnap.docs) {
    const data = d.data();
    const used = typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
    const quota = typeof data.storage_quota_bytes === "number" ? data.storage_quota_bytes : 2 * 1024 ** 3;
    if (quota > 0 && used >= quota * 0.95) {
      storageAlertUids.push(d.id);
      alerts.push({
        id: `storage-${d.id}`,
        severity: used >= quota ? "critical" : "warning",
        title: `Storage near/full limit`,
        source: "Storage",
        timestamp: now,
        targetUserId: d.id,
        recommendedAction: "Consider upgrading plan or clearing files",
      });
    }
  }

  if (storageAlertUids.length > 0) {
    try {
      const result = await authService.getUsers(storageAlertUids.map((uid) => ({ uid })));
      const emailMap = new Map<string, string>();
      for (const [uid, r] of Object.entries(result.users)) {
        if (r.email) emailMap.set(uid, r.email);
      }
      for (const a of alerts) {
        if (a.targetUserId && a.source === "Storage") {
          a.title = `Storage near/full limit: ${emailMap.get(a.targetUserId) ?? a.targetUserId}`;
        }
      }
    } catch (_) {}
  }

  try {
    const stripe = getStripeInstance();
    const subs = await stripe.subscriptions.list({ status: "past_due", limit: 20 });
    const pastDueUids = subs.data.map((s) => s.metadata?.userId as string).filter(Boolean);
    if (pastDueUids.length > 0) {
      try {
        const result = await authService.getUsers(pastDueUids.map((uid) => ({ uid })));
        const emailMap = new Map<string, string>();
        for (const [uid, r] of Object.entries(result.users)) {
          if (r.email) emailMap.set(uid, r.email);
        }
        for (const sub of subs.data) {
          const uid = sub.metadata?.userId as string | undefined;
          if (!uid) continue;
          alerts.push({
            id: `payment-${sub.id}`,
            severity: "critical",
            title: `Past due payment: ${emailMap.get(uid) ?? uid}`,
            source: "Payments",
            timestamp: now,
            targetUserId: uid,
            recommendedAction: "Check Stripe dashboard for payment status",
          });
        }
      } catch (_) {
        for (const sub of subs.data) {
          const uid = sub.metadata?.userId as string | undefined;
          if (!uid) continue;
          alerts.push({
            id: `payment-${sub.id}`,
            severity: "critical",
            title: `Past due payment: ${uid}`,
            source: "Payments",
            timestamp: now,
            targetUserId: uid,
            recommendedAction: "Check Stripe dashboard for payment status",
          });
        }
      }
    }
  } catch (_) {}

  if (severity) {
    const severities = severity.split(",").map((s) => s.trim());
    const filtered = alerts.filter((a) => severities.includes(a.severity));
    return NextResponse.json(filtered.slice(0, limit));
  }
  return NextResponse.json(alerts.slice(0, limit));
}
