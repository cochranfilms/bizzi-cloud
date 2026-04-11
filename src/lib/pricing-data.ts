/**
 * Shared pricing data for PricingSection and Change Plan page.
 */

export const BIZZI_BYTE_COLORS = {
  matcha: "#84cc16",
  habanero: "#dc2626",
  frost: "#38bdf8",
  onyx: "#171717",
} as const;

export const freeTier = {
  name: "Starter Free",
  tagline: "Free Forever",
  storage: "2 GB",
  price: 0,
  accentColor: BIZZI_BYTE_COLORS.matcha,
  subtext: "Free forever, always",
  description:
    "Your first step into the cloud — no credit card, no expiry.",
  features: [
    "2 GB AES-256 encrypted storage",
    "Upload & access from any device",
    "Download your files anytime",
    "Share links for files & folders",
    "Basic folder organization",
  ],
  limitations: [
    "500 MB max file size",
    "No extra storage add-on",
  ],
  addOnsNote:
    "Gallery Suite, Editor & Full Frame add-ons available when you upgrade",
  cta: "Get Started Free",
};

/** Extra seat price per month (for plans that allow seats) */
export const SEAT_PRICE = 10;

/** Annual billing: percent off vs paying 12× monthly (display + Stripe annual amounts). */
export const ANNUAL_SAVINGS_PERCENT = 18;

export function annualPriceUsdFromMonthly(monthlyUsd: number): number {
  return Math.round(monthlyUsd * 12 * (1 - ANNUAL_SAVINGS_PERCENT / 100));
}

/** Storage tier options for unified plan builder. Includes free + paid. */
export const storageTiers = [
  {
    id: "free",
    name: "Free",
    storage: "2 GB",
    price: 0,
    annualPrice: 0,
    allowsSeats: false,
    accentColor: BIZZI_BYTE_COLORS.matcha,
  },
  {
    id: "solo",
    name: "Bizzi Creator",
    storage: "1 TB",
    price: 12,
    annualPrice: annualPriceUsdFromMonthly(12),
    allowsSeats: false,
    accentColor: BIZZI_BYTE_COLORS.matcha,
  },
  {
    id: "indie",
    name: "Bizzi Pro",
    storage: "2 TB",
    price: 20,
    annualPrice: annualPriceUsdFromMonthly(20),
    allowsSeats: true,
    accentColor: BIZZI_BYTE_COLORS.habanero,
  },
  {
    id: "video",
    name: "Bizzi Network",
    storage: "5 TB",
    price: 45,
    annualPrice: annualPriceUsdFromMonthly(45),
    allowsSeats: true,
    accentColor: BIZZI_BYTE_COLORS.frost,
  },
  {
    id: "production",
    name: "We Bizzi",
    storage: "10 TB",
    price: 90,
    annualPrice: annualPriceUsdFromMonthly(90),
    allowsSeats: true,
    accentColor: BIZZI_BYTE_COLORS.onyx,
  },
];

/** Bizzi Pro / Network / We Bizzi — personal team seats allowed (not Free / Creator). */
export function planAllowsPersonalTeamSeats(planId: string): boolean {
  return storageTiers.some((t) => t.id === planId && t.allowsSeats);
}

export const plans = [
  {
    id: "solo",
    name: "Bizzi Creator",
    tagline: "Essential",
    storage: "1 TB",
    price: 12,
    annualPrice: annualPriceUsdFromMonthly(12),
    features: [
      "1 TB Encrypted Cloud Storage",
      "Access Your Files Anywhere (Wi‑Fi Enabled)",
      "Creative Asset Management",
      "Creator-Optimized Workflows",
      "Multi-User Project Access",
      "Large File Transfers (Up to 75 GB)",
      "30-Day Deleted File Recovery",
      "Creator-Optimized File Support (RAW video, S-Log, ProRes, BRAW, RAW photos, PNG, JPG and more)",
    ],
    limitations: ["No extra storage add-on"],
    addOnsNote: "Gallery Suite, Editor & Full Frame. Additional storage add-ons when plan is chosen.",
    cta: "Start Membership",
    accentColor: BIZZI_BYTE_COLORS.matcha,
  },
  {
    id: "indie",
    name: "Bizzi Pro",
    tagline: "Most Popular",
    storage: "2 TB",
    price: 20,
    annualPrice: annualPriceUsdFromMonthly(20),
    popular: true,
    features: [
      "2 TB Encrypted Cloud Storage",
      "Custom Branding & Custom URL Links",
      "Large File Transfers (Up to 100 GB)",
      "60-Day Deleted File Recovery",
      "Access Your Files Anywhere (Wi‑Fi Enabled)",
      "Advanced Creative Asset Management",
      "Creator-Optimized Workflow",
      "Multi-User Project Access",
      "Creator-Optimized File Support (RAW video, S-Log, ProRes, BRAW, ARRIRAW, (RED) RAW, RAW photos, PNG, JPG and more)",
    ],
    addOnsNote:
      "Gallery Suite, Editor, Full Frame. Additional storage add-ons when plan is chosen.",
    cta: "Join Now",
    accentColor: BIZZI_BYTE_COLORS.habanero,
  },
  {
    id: "video",
    name: "Bizzi Network",
    tagline: "Professional",
    storage: "5 TB",
    price: 45,
    annualPrice: annualPriceUsdFromMonthly(45),
    features: [
      "5 TB Encrypted Cloud Storage",
      "Up to 6 Team Seats",
      "Custom Branding & Custom URL Links",
      "Large File Transfers (Up to 100 GB)",
      "90-Day Deleted File Recovery",
      "Access Your Files Anywhere (Wi‑Fi Enabled)",
      "Advanced Creative Asset Management",
      "Creator-Optimized Workflow",
      "Multi-User Project Access",
      "Creator-Optimized File Support (RAW video, S-Log, ProRes, BRAW, ARRIRAW, (RED) RAW, RAW photos, PNG, JPG and more)",
    ],
    addOnsNote:
      "Gallery Suite, Editor, Full Frame. Additional storage add-ons when plan is chosen.",
    cta: "Start Membership",
    accentColor: BIZZI_BYTE_COLORS.frost,
  },
  {
    id: "production",
    name: "We Bizzi",
    tagline: "Agency & Production",
    storage: "10 TB",
    price: 90,
    annualPrice: annualPriceUsdFromMonthly(90),
    features: [
      "10 TB Encrypted Cloud Storage",
      "Up to 10 Team Seats",
      "Custom Branding & Custom URL Links",
      "Asset Management",
      "Large File Transfers (Up to 100 GB)",
      "180-Day Deleted File Recovery",
      "Access Your Files Anywhere (Wi‑Fi Enabled)",
      "Creator-Optimized Workflow",
      "Multi-User Project Access",
      "Creator-Optimized File Support (RAW video, S-Log, ProRes, BRAW, ARRIRAW, (RED) RAW, RAW photos, PNG, JPG and more)",
    ],
    addOnsNote:
      "Gallery Suite, Editor, Full Frame. Contact sales for enterprise storage.",
    cta: "Start Membership",
    accentColor: BIZZI_BYTE_COLORS.onyx,
  },
];

export const powerUpAddons = [
  {
    id: "gallery",
    name: "Bizzi Gallery Suite",
    tagline: "Gallery + Invoicing",
    price: 8,
    description:
      "Photo galleries with invoicing, proofing & client delivery. 3 Lightroom presets included — toggle on/off like Rec.709.",
    features: [
      "Unlimited branded client galleries",
      "Client proofing — favorites, approvals & downloads",
      "Custom gallery domain & branding",
      "Invoice & contract templates",
      "Stripe deposit & payment collection",
      "Revenue dashboard & payment reminders",
      "3 custom Lightroom presets (toggle on/off)",
    ],
    accentColor: "#ECA000",
  },
  {
    id: "editor",
    name: "Bizzi Editor",
    tagline: "Cloud Native Drive",
    price: 15,
    description:
      "Mount your cloud as a virtual SSD and edit videos and photos natively in any editing software. Bizzi Editor automatically generates proxies for smooth performance, then instantly relinks your timeline to full-resolution media with Bizzi Conform — all in one click.",
    features: [
      "Mount as virtual drive in Premiere, Resolve & Final Cut",
      "Rec.709 LUTs — toggle on/off per clip",
      "Stream R3D, BRAW, ProRes RAW & ARRIRAW natively",
      "Smart local cache for frequently accessed clips",
      "3 Rec.709 LUT packs, camera-matched",
      "S-Log3 & LogC3 input transforms",
    ],
    accentColor: "#A47BFF",
  },
  {
    id: "fullframe",
    name: "Bizzi Full Frame",
    tagline: "Gallery Suite + Editor bundled",
    price: 20,
    description:
      "The complete creative stack — galleries, invoicing, proofing, and NLE editing with Rec.709. Both Power Ups in one.",
    bundleNote: "Save $3/mo vs buying Gallery Suite and Editor separately",
    features: [
      "Everything in Bizzi Gallery Suite",
      "Unlimited galleries, proofing & invoicing",
      "3 custom Lightroom presets (toggle on/off)",
      "Everything in Bizzi Editor",
      "NLE cloud drive — virtual SSD in your NLE",
      "3 Rec.709 LUT packs (toggle on/off)",
    ],
    accentColor: "#1EC8A8",
  },
];

export const PLAN_LABELS: Record<string, string> = {
  free: "Starter Free",
  solo: "Bizzi Creator",
  indie: "Bizzi Pro",
  video: "Bizzi Network",
  production: "We Bizzi",
};

export const ADDON_LABELS: Record<string, string> = {
  gallery: "Bizzi Gallery Suite",
  editor: "Bizzi Editor",
  fullframe: "Bizzi Full Frame",
};

/**
 * Storage add-ons (internal only — shown in Change Plan after signup).
 * Bizzi Pro (indie): +1, +2, +3 TB. Bizzi Network (video): +1, +2, +3, +4, +5 TB.
 * Bizzi Creator (solo) and Enterprise Creative (production) do not support storage add-ons.
 */
export type StorageAddonId =
  | "indie_1"
  | "indie_2"
  | "indie_3"
  | "video_1"
  | "video_2"
  | "video_3"
  | "video_4"
  | "video_5";

export const STORAGE_ADDONS: Record<
  "indie" | "video",
  Array<{ id: StorageAddonId; tb: number; price: number; upgradePrompt?: string }>
> = {
  indie: [
    { id: "indie_1", tb: 1, price: 10 },
    { id: "indie_2", tb: 2, price: 20, upgradePrompt: "You're almost at Bizzi Network pricing. Upgrade for more features at the same cost." },
    { id: "indie_3", tb: 3, price: 30, upgradePrompt: "You're almost at Bizzi Network pricing. Upgrade for more features at the same cost." },
  ],
  video: [
    { id: "video_1", tb: 1, price: 10 },
    { id: "video_2", tb: 2, price: 20 },
    { id: "video_3", tb: 3, price: 30 },
    { id: "video_4", tb: 4, price: 40, upgradePrompt: "You're almost at Enterprise Creative pricing. Upgrade for more features." },
    { id: "video_5", tb: 5, price: 50, upgradePrompt: "You're almost at Enterprise Creative pricing. Upgrade for more features." },
  ],
};

export const STORAGE_ADDON_LABELS: Record<StorageAddonId, string> = {
  indie_1: "+1 TB",
  indie_2: "+2 TB",
  indie_3: "+3 TB",
  video_1: "+1 TB",
  video_2: "+2 TB",
  video_3: "+3 TB",
  video_4: "+4 TB",
  video_5: "+5 TB",
};

export const STORAGE_ADDON_TB: Record<StorageAddonId, number> = {
  indie_1: 1,
  indie_2: 2,
  indie_3: 3,
  video_1: 1,
  video_2: 2,
  video_3: 3,
  video_4: 4,
  video_5: 5,
};

export const VALID_STORAGE_ADDON_IDS: StorageAddonId[] = [
  "indie_1",
  "indie_2",
  "indie_3",
  "video_1",
  "video_2",
  "video_3",
  "video_4",
  "video_5",
];

/** Get TB from storage addon ID; returns 0 if unknown. */
export function getStorageAddonTb(storageAddonId: StorageAddonId | string): number {
  return STORAGE_ADDON_TB[storageAddonId as StorageAddonId] ?? 0;
}
