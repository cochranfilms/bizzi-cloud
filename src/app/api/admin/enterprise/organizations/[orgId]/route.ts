/**
 * GET /api/admin/enterprise/organizations/[orgId]
 * Admin-only: Fetch org details for editing (storage, addons, current prices from Stripe).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getStripeInstance } from "@/lib/stripe";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const TB = 1024 * 1024 * 1024 * 1024;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { orgId } = await params;
  const db = getAdminFirestore();

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const data = orgSnap.data()!;
  const storageQuotaBytes = data.storage_quota_bytes ?? null;
  const storageTb =
    typeof storageQuotaBytes === "number"
      ? Math.round(storageQuotaBytes / TB)
      : 20;
  const addonIds = Array.isArray(data.addon_ids) ? (data.addon_ids as string[]) : [];
  let storagePriceMonthly: number | null = null;

  const subId = data.stripe_subscription_id as string | undefined;
  if (subId) {
    try {
      const stripe = getStripeInstance();
      const sub = await stripe.subscriptions.retrieve(subId, {
        expand: ["items.data.price", "items.data.price.product"],
      });
      for (const item of sub.items.data) {
        if (item.deleted) continue;
        const price = item.price as Stripe.Price;
        const product = price.product as Stripe.Product;
        const prodMeta = product?.metadata ?? {};
        const priceMeta = price?.metadata ?? {};
        const isOrgStorage =
          prodMeta.organization_id === orgId ||
          (typeof product?.name === "string" && product.name.startsWith("Enterprise Storage"));
        if (isOrgStorage && price.unit_amount != null) {
          storagePriceMonthly = price.unit_amount / 100;
          break;
        }
      }
    } catch (err) {
      console.error("[org-detail] Failed to fetch subscription:", err);
    }
  }

  return NextResponse.json({
    id: orgId,
    name: data.name ?? "Unnamed",
    storage_quota_bytes: storageQuotaBytes,
    storage_tb: storageTb,
    storage_price_monthly: storagePriceMonthly,
    addon_ids: addonIds,
    max_seats: data.max_seats ?? null,
    stripe_subscription_id: subId ?? null,
    removal_requested_at: data.removal_requested_at?.toDate?.()?.toISOString() ?? null,
  });
}
