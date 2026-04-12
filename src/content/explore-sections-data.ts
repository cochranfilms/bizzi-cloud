/**
 * Structured metadata for Explore Bizzi — nav, quick jump, journeys, related topics.
 * Body copy lives in server section components; keep anchors in sync with this file.
 */

export type ExploreNavItem = {
  id: string;
  label: string;
  /** Flattened for quick jump + search */
  keywords: string[];
  aliases: string[];
  children?: { id: string; label: string }[];
};

export type ExploreJourney = {
  id: string;
  title: string;
  description: string;
  sectionIds: string[];
};

export type ExploreSectionMeta = {
  id: string;
  title: string;
  summary: string;
  relatedSectionIds: string[];
  sectionCta?: { label: string; href: string };
};

/** Primary TOC — order = scroll order for spy + sidebar */
export const EXPLORE_NAV: ExploreNavItem[] = [
  {
    id: "explore-hero",
    label: "Welcome",
    keywords: ["start", "welcome", "overview", "explore"],
    aliases: ["home", "begin"],
  },
  {
    id: "choose-journey",
    label: "Choose your journey",
    keywords: ["path", "recommended", "new", "journey", "start here"],
    aliases: ["routes", "guides"],
  },
  {
    id: "what-is-bizzi",
    label: "What Bizzi Cloud is",
    keywords: ["platform", "creators", "video", "photo", "workflow", "cloud"],
    aliases: ["what is bizzi", "introduction"],
  },
  {
    id: "how-its-different",
    label: "How Bizzi is different",
    keywords: ["dropbox", "storage", "compare", "unique", "creators"],
    aliases: ["difference", "vs", "generic"],
  },
  {
    id: "what-bizzi-is-not",
    label: "What Bizzi is not",
    keywords: ["not", "positioning", "clarity"],
    aliases: ["misconceptions"],
  },
  {
    id: "getting-started",
    label: "Getting started",
    keywords: ["onboarding", "steps", "first", "setup", "begin"],
    aliases: ["tutorial", "start"],
  },
  {
    id: "who-its-for",
    label: "Who it’s for",
    keywords: ["solo", "team", "agency", "photographer", "editor", "studio"],
    aliases: ["audience", "roles", "creators"],
    children: [
      { id: "who-solo", label: "Solo creators" },
      { id: "who-freelance", label: "Freelance editors" },
      { id: "who-photo", label: "Photographers" },
      { id: "who-video", label: "Videographers" },
      { id: "who-production", label: "Production teams" },
      { id: "who-agency", label: "Agencies" },
      { id: "who-studio", label: "Studios" },
    ],
  },
  {
    id: "workspaces",
    label: "Workspaces",
    keywords: ["workspace", "personal", "team", "organization", "client"],
    aliases: ["space", "account"],
  },
  {
    id: "storage-organization",
    label: "Storage & organization",
    keywords: ["folders", "files", "organize", "projects", "footage"],
    aliases: ["structure", "library"],
  },
  {
    id: "uploads-imports",
    label: "Uploads & imports",
    keywords: ["upload", "import", "drag", "drop", "camera", "card", "sd"],
    aliases: ["ingest", "backup", "media"],
  },
  {
    id: "mount-vs-local",
    label: "Mount-style vs store locally",
    keywords: ["mount", "virtual", "ssd", "drive", "sync", "local", "offline"],
    aliases: ["stream", "edit", "disk"],
  },
  {
    id: "stream-cache",
    label: "Stream cache & speed",
    keywords: ["cache", "speed", "fast", "playback", "scrub", "buffer"],
    aliases: ["performance", "local layer"],
  },
  {
    id: "editing-speed",
    label: "Editing speed & lightweight previews",
    keywords: ["proxy", "preview", "edit", "timeline", "export", "quality"],
    aliases: ["nle", "premiere", "resolve"],
  },
  {
    id: "bizzi-editor",
    label: "Bizzi Editor",
    keywords: ["editor", "cut", "timeline", "project"],
    aliases: ["editing app"],
  },
  {
    id: "galleries-proofing",
    label: "Galleries & proofing",
    keywords: ["gallery", "proof", "client", "review", "selects", "favorites"],
    aliases: ["approval", "feedback"],
  },
  {
    id: "transfers-delivery",
    label: "Transfers & delivery",
    keywords: ["transfer", "delivery", "link", "send", "download", "package"],
    aliases: ["share large files", "client delivery"],
  },
  {
    id: "teams-collaboration",
    label: "Teams & collaboration",
    keywords: ["team", "invite", "roles", "share", "agency", "collaborate"],
    aliases: ["organization", "members"],
  },
  {
    id: "performance-modes",
    label: "Performance modes",
    keywords: ["remote", "travel", "agency", "photographer", "production"],
    aliases: ["best for", "playbooks", "recommendations"],
  },
  {
    id: "pricing-growth",
    label: "Pricing & growing storage",
    keywords: ["price", "plan", "storage", "scale", "grow", "addon"],
    aliases: ["billing", "quota"],
  },
  {
    id: "workflow-examples",
    label: "Suggested workflows",
    keywords: ["workflow", "examples", "diagram", "process"],
    aliases: ["journeys", "diagrams"],
  },
  {
    id: "faq",
    label: "FAQ",
    keywords: ["question", "help", "answers"],
    aliases: ["common questions"],
  },
  {
    id: "explore-cta",
    label: "Next steps",
    keywords: ["signup", "waitlist", "desktop", "get started"],
    aliases: ["cta", "join"],
  },
];

export const EXPLORE_JOURNEYS: ExploreJourney[] = [
  {
    id: "new-to-bizzi",
    title: "New to Bizzi",
    description: "Orientation, first steps, and how to think in workspaces.",
    sectionIds: ["what-is-bizzi", "getting-started", "workspaces", "storage-organization"],
  },
  {
    id: "editing-cloud",
    title: "Editing from the cloud",
    description: "Mount-style access, stream cache, and fast editing workflows.",
    sectionIds: ["mount-vs-local", "stream-cache", "editing-speed", "bizzi-editor"],
  },
  {
    id: "proofing-delivery",
    title: "Client proofing & delivery",
    description: "Galleries, review, and polished handoff.",
    sectionIds: ["galleries-proofing", "transfers-delivery", "workflow-examples"],
  },
  {
    id: "teams",
    title: "Working with teams",
    description: "Shared workspaces, roles, and collaboration.",
    sectionIds: ["workspaces", "teams-collaboration", "performance-modes"],
  },
  {
    id: "travel-offline",
    title: "Travel & offline prep",
    description: "Local storage choices and speed when you are on the move.",
    sectionIds: ["mount-vs-local", "stream-cache", "performance-modes"],
  },
];

export const EXPLORE_SECTION_ORDER: string[] = EXPLORE_NAV.map((n) => n.id);

/** Document order for scroll spy — includes subsection anchors (e.g. role cards). */
export function exploreFlattenSpyIds(nav: ExploreNavItem[]): string[] {
  const out: string[] = [];
  for (const item of nav) {
    out.push(item.id);
    if (item.children) {
      for (const ch of item.children) out.push(ch.id);
    }
  }
  return out;
}

export const EXPLORE_SCROLL_SPY_IDS: string[] = exploreFlattenSpyIds(EXPLORE_NAV);

/** Related topics — editorial map */
export const EXPLORE_RELATED: Record<string, string[]> = {
  "explore-hero": ["choose-journey", "what-is-bizzi", "getting-started"],
  "choose-journey": ["what-is-bizzi", "getting-started", "mount-vs-local"],
  "what-is-bizzi": ["how-its-different", "getting-started", "who-its-for"],
  "how-its-different": ["what-bizzi-is-not", "workspaces", "mount-vs-local"],
  "what-bizzi-is-not": ["what-is-bizzi", "getting-started"],
  "getting-started": ["workspaces", "uploads-imports", "mount-vs-local"],
  "who-its-for": ["workspaces", "performance-modes", "workflow-examples"],
  workspaces: ["storage-organization", "teams-collaboration", "getting-started"],
  "storage-organization": ["uploads-imports", "workflow-examples", "pricing-growth"],
  "uploads-imports": ["mount-vs-local", "workflow-examples", "storage-organization"],
  "mount-vs-local": ["stream-cache", "editing-speed", "performance-modes"],
  "stream-cache": ["mount-vs-local", "editing-speed", "workflow-examples"],
  "editing-speed": ["bizzi-editor", "stream-cache", "mount-vs-local"],
  "bizzi-editor": ["editing-speed", "mount-vs-local", "workflow-examples"],
  "galleries-proofing": ["transfers-delivery", "teams-collaboration", "workflow-examples"],
  "transfers-delivery": ["galleries-proofing", "workflow-examples", "teams-collaboration"],
  "teams-collaboration": ["workspaces", "galleries-proofing", "performance-modes"],
  "performance-modes": ["mount-vs-local", "stream-cache", "pricing-growth"],
  "pricing-growth": ["workspaces", "getting-started", "explore-cta"],
  "workflow-examples": ["getting-started", "faq", "explore-cta"],
  faq: ["explore-cta", "what-is-bizzi", "getting-started"],
};

/** Section CTAs — href can be in-page # or app routes */
export const EXPLORE_SECTION_CTAS: Record<string, { label: string; href: string }> = {
  "getting-started": { label: "Start with your first workspace", href: "/login" },
  "mount-vs-local": { label: "Find the best setup for your workflow", href: "#performance-modes" },
  "galleries-proofing": { label: "Explore client proofing", href: "#transfers-delivery" },
  "transfers-delivery": { label: "See delivery workflows", href: "#workflow-examples" },
};

export type ExploreFaqItem = { id: string; question: string; answer: string };

export const EXPLORE_FAQ: ExploreFaqItem[] = [
  {
    id: "faq-edit-direct",
    question: "Can I edit directly from Bizzi?",
    answer:
      "Yes—that is the idea. Bizzi is built so your media can feel like it lives on a fast creative drive. You work from previews and lightweight versions for speed, then move to full-quality files when you are ready to finish. The desktop experience is designed around editing workflows, not just downloading everything first.",
  },
  {
    id: "faq-download-all",
    question: "Do I need to download everything before I edit?",
    answer:
      "No. You can open and work with what you need, when you need it. Stream cache keeps recently used clips feeling responsive, and lightweight previews help you stay fast on the timeline before you pull full-resolution media for final export.",
  },
  {
    id: "faq-stream-cache",
    question: "What is stream cache?",
    answer:
      "Think of it as a local speed layer. Bizzi can keep recently used footage ready on your machine so playback, scrubbing, and active sessions feel smoother. You choose how much space to dedicate—small, medium, or larger—based on your projects and disk space.",
  },
  {
    id: "faq-mount-vs-local",
    question: "What is the difference between mount-style access and storing files locally?",
    answer:
      "Mount-style access feels like a virtual creative drive: files stay in the cloud, and you open them on demand. Storing locally (native sync style) keeps full copies on disk for offline work or maximum responsiveness. Many teams mix both—cloud access for breadth, local storage for travel or heavy sessions.",
  },
  {
    id: "faq-clients-review",
    question: "Can clients review photos and videos in Bizzi?",
    answer:
      "Yes. Galleries are built for proofing—clients can browse, favorite selects, and leave clear feedback. That is different from simply sending a raw download link: review happens in a structured, client-friendly experience.",
  },
  {
    id: "faq-teams",
    question: "Can teams work together in Bizzi?",
    answer:
      "Yes. Workspaces can be personal or shared. Teams invite members, share assets, and coordinate review and delivery—ideal for agencies, studios, and brands that need one home for production media.",
  },
  {
    id: "faq-travel",
    question: "Can I use Bizzi while traveling?",
    answer:
      "Yes. Choose how much media you keep locally for offline prep, lean on stream cache for active work, and use performance recommendations for travel and remote editing. The platform is built for creators who move between set, studio, and home.",
  },
  {
    id: "faq-large-libraries",
    question: "How does Bizzi help with large media libraries?",
    answer:
      "Organization starts with workspaces, folders, and project structure. You are not meant to treat Bizzi as an undifferentiated pile of files—think brands, clients, and projects. Previews and lightweight workflows help you navigate huge libraries without pulling every file down at once.",
  },
  {
    id: "faq-delivery",
    question: "How does delivery work?",
    answer:
      "Transfers package files for clients with a polished handoff—links, optional passwords, and a clear download experience. Pair that with galleries for review, and you have both sides of the job: feedback and final delivery.",
  },
  {
    id: "faq-vs-generic",
    question: "What makes Bizzi better than generic cloud storage?",
    answer:
      "Generic cloud is built for documents and light sharing. Bizzi is built for creative media—editing workflows, proofing, team coordination, and delivery at production scale. The difference is in how you access, review, and ship work—not just where files sit.",
  },
];

export function exploreNavLabelForId(id: string): string {
  for (const item of EXPLORE_NAV) {
    if (item.id === id) return item.label;
    if (item.children) {
      const c = item.children.find((ch) => ch.id === id);
      if (c) return c.label;
    }
  }
  return id;
}
