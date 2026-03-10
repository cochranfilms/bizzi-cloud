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

export const plans = [
  {
    id: "solo",
    name: "Solo Creator",
    tagline: "Essential",
    storage: "1 TB",
    price: 12,
    annualPrice: 108,
    features: [
      "1 TB AES-256 encrypted storage",
      "Files up to 20 GB each",
      "Download & share links",
      "Unlimited bandwidth",
      "Password-protected links",
      "30-day version history",
    ],
    limitations: ["No extra storage add-on"],
    addOnsNote: "Gallery Suite, Editor & Full Frame available",
    cta: "Choose Solo Creator",
    accentColor: BIZZI_BYTE_COLORS.matcha,
  },
  {
    id: "indie",
    name: "Indie Filmmaker",
    tagline: "Most Popular",
    storage: "2 TB",
    price: 20,
    annualPrice: 180,
    popular: true,
    features: [
      "2 TB AES-256 encrypted storage",
      "Files up to 50 GB — RAW ready",
      "Download & share links",
      "Unlimited bandwidth",
      "60-day version history",
      "Up to 2 collaborators",
      "Review & approval workflow",
    ],
    addOnsNote:
      "Gallery Suite, Editor, Full Frame + Extra storage up to +5 TB",
    cta: "Choose Indie Filmmaker",
    accentColor: BIZZI_BYTE_COLORS.habanero,
  },
  {
    id: "video",
    name: "Video Pro",
    tagline: "Professional",
    storage: "5 TB",
    price: 35,
    annualPrice: 315,
    features: [
      "5 TB AES-256 encrypted storage",
      "Files up to 200 GB each",
      "Download & share links",
      "Accelerated upload speeds",
      "90-day version history",
      "Up to 5 collaborators",
      "Branded client delivery pages",
    ],
    addOnsNote:
      "Gallery Suite, Editor, Full Frame + Extra storage up to +10 TB",
    cta: "Choose Video Pro",
    accentColor: BIZZI_BYTE_COLORS.frost,
  },
  {
    id: "production",
    name: "Production House",
    tagline: "Agency & Production",
    storage: "10 TB",
    price: 70,
    annualPrice: 630,
    features: [
      "10 TB AES-256 encrypted storage",
      "Unlimited file size uploads",
      "Download & share links",
      "Priority transfer speeds",
      "Unlimited version history",
      "Up to 10 team seats",
      "SSO & advanced permissions",
    ],
    addOnsNote:
      "Gallery Suite, Editor, Full Frame + Extra storage up to +20 TB",
    cta: "Choose Production House",
    accentColor: BIZZI_BYTE_COLORS.onyx,
  },
];

export const powerUpAddons = [
  {
    id: "gallery",
    name: "Bizzi Gallery Suite",
    tagline: "Gallery + Invoicing",
    price: 5,
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
    tagline: "NLE Cloud Drive + Rec.709",
    price: 8,
    description:
      "Mount your cloud as a virtual SSD. NLE editing with Rec.709 LUTs — edit RAW natively in Premiere, Resolve & Final Cut.",
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
    price: 10,
    description:
      "The complete creative stack — galleries, invoicing, proofing, and NLE editing with Rec.709. Both Power Ups in one.",
    bundleNote: "Save $3/mo vs buying separately",
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
  solo: "Solo Creator",
  indie: "Indie Filmmaker",
  video: "Video Pro",
  production: "Production House",
};

export const ADDON_LABELS: Record<string, string> = {
  gallery: "Bizzi Gallery Suite",
  editor: "Bizzi Editor",
  fullframe: "Bizzi Full Frame",
};
