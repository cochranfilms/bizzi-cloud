import { env, envBool } from "./env.js";
import { normalizeBaseUrl } from "./http.js";

/**
 * @typedef {Object} GuardConfig
 * @property {string} script
 * @property {string[]} [requires] env names that must be non-empty
 * @property {boolean} [includeGalleryView] K6_INCLUDE_GALLERY_VIEW
 * @property {boolean} [includeGalleryPostMutations] POST comments/favorites (data writes)
 * @property {boolean} [includeB2Writes]
 * @property {boolean} [includeUploadPresign]
 * @property {boolean} [includeMetadataExtract]
 * @property {boolean} [includeStripe]
 * @property {boolean} [includeUploadSessionCreate]
 */

/**
 * @param {string} url
 */
function urlLooksProduction(url) {
  const subs = env("K6_PRODUCTION_URL_SUBSTRINGS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (subs.length === 0) return false;
  const lower = url.toLowerCase();
  return subs.some((s) => lower.includes(s.toLowerCase()));
}

/**
 * @param {string} name
 */
function requireNonEmpty(name) {
  const v = env(name, "");
  if (!v) {
    throw new Error(`[k6 guards] Missing required env: ${name}`);
  }
}

/** Normalize the same way as authHeadersJson (Bearer prefix, quotes, trim). */
function normalizedBearerValue() {
  let t = env("BEARER_TOKEN", "").trim().replace(/^["']|["']$/g, "");
  if (/^bearer\s+/i.test(t)) {
    t = t.replace(/^bearer\s+/i, "").trim();
  }
  return t;
}

/**
 * Firebase **client** ID tokens are JWTs starting with "eyJ".
 * Catches unchanged template values before a useless 401 probe.
 */
function assertFirebaseClientIdTokenShape() {
  const t = normalizedBearerValue();
  const lower = t.toLowerCase();
  if (
    lower.includes("paste-firebase") ||
    lower.includes("jwt-here") ||
    lower.includes("your_firebase_jwt") ||
    t === "YOUR_FIREBASE_JWT"
  ) {
    throw new Error(
      "[k6 guards] BEARER_TOKEN is still the template placeholder. In k6/.env.local, replace it with a real Firebase ID token from the browser (DevTools → Network → any /api/* request → copy the JWT only, value starts with eyJ)."
    );
  }
  if (!t.startsWith("eyJ")) {
    throw new Error(
      "[k6 guards] BEARER_TOKEN must be a Firebase **ID token** (JWT), which starts with \"eyJ\". You may have pasted a refresh token or the word \"Bearer\" twice — see k6/README.md."
    );
  }
  const parts = t.split(".");
  if (parts.length < 3) {
    throw new Error("[k6 guards] BEARER_TOKEN does not look like a valid JWT (expected three dot-separated segments).");
  }
}

/**
 * @param {string} s
 */
function maskToken(s) {
  if (!s) return "(none)";
  if (s.length <= 8) return "****";
  return `…${s.slice(-4)}`;
}

/**
 * @param {string} s
 */
function boolMark(s) {
  return s ? "set" : "(empty)";
}

/**
 * @param {GuardConfig} cfg
 */
export function assertK6Ready(cfg) {
  requireNonEmpty("BASE_URL");
  const base = normalizeBaseUrl(env("BASE_URL", ""));
  if (!base) {
    throw new Error("[k6 guards] BASE_URL is empty after normalize.");
  }

  if (urlLooksProduction(base) && !envBool("K6_ALLOW_PRODUCTION")) {
    throw new Error(
      "[k6 guards] BASE_URL matches K6_PRODUCTION_URL_SUBSTRINGS; set K6_ALLOW_PRODUCTION=1 to proceed."
    );
  }

  const requires = cfg.requires || [];
  for (let i = 0; i < requires.length; i++) {
    requireNonEmpty(requires[i]);
  }

  if (requires.includes("BEARER_TOKEN")) {
    assertFirebaseClientIdTokenShape();
  }

  const allowData = envBool("K6_ALLOW_MUTATIONS");
  const allowAnalytics = envBool("K6_ALLOW_ANALYTICS_MUTATIONS");

  if (cfg.includeGalleryView) {
    if (!allowData && !allowAnalytics) {
      throw new Error(
        "[k6 guards] K6_INCLUDE_GALLERY_VIEW=1 requires K6_ALLOW_MUTATIONS=1 or K6_ALLOW_ANALYTICS_MUTATIONS=1 (GET /view increments view_count)."
      );
    }
  }

  if (cfg.includeGalleryPostMutations) {
    if (!allowData) {
      throw new Error(
        "[k6 guards] Gallery POST mutations require K6_ALLOW_MUTATIONS=1 (K6_ALLOW_ANALYTICS_MUTATIONS is not sufficient)."
      );
    }
    requireNonEmpty("TEST_GALLERY_ID");
    requireNonEmpty("TEST_ASSET_IDS");
  }

  const dataMutationFlags =
    (cfg.includeB2Writes ? 1 : 0) +
    (cfg.includeUploadPresign ? 1 : 0) +
    (cfg.includeMetadataExtract ? 1 : 0) +
    (cfg.includeStripe ? 1 : 0) +
    (cfg.includeUploadSessionCreate ? 1 : 0);

  if (dataMutationFlags > 0 && !allowData) {
    throw new Error(
      "[k6 guards] A data-mutation path is enabled; set K6_ALLOW_MUTATIONS=1."
    );
  }

  if (cfg.includeB2Writes || cfg.includeUploadPresign || cfg.includeUploadSessionCreate) {
    requireNonEmpty("TEST_DISPOSABLE_DRIVE_ID");
  }

  if (cfg.includeMetadataExtract) {
    requireNonEmpty("TEST_BACKUP_FILE_ID");
  }

  printStartupSummary(cfg, base);
}

/**
 * @param {GuardConfig} cfg
 * @param {string} base
 */
function printStartupSummary(cfg, base) {
  const tok = env("BEARER_TOKEN", "");
  const inv = env("INVALID_BEARER_TOKEN", "");
  // loud banner for operators
  console.log("");
  console.log("========== K6 startup ==========");
  console.log(`script:      ${cfg.script}`);
  console.log(`BASE_URL:    ${base}`);
  console.log(`K6_PROFILE:  ${env("K6_PROFILE", "load")}`);
  console.log(`K6_EXECUTOR: ${env("K6_EXECUTOR", "(see profile)")}`);
  console.log(
    `flags:       ALLOW_MUTATIONS=${envBool("K6_ALLOW_MUTATIONS")} ALLOW_ANALYTICS_MUTATIONS=${envBool("K6_ALLOW_ANALYTICS_MUTATIONS")} ALLOW_PRODUCTION=${envBool("K6_ALLOW_PRODUCTION")}`
  );
  console.log(
    `gallery:     INCLUDE_VIEW=${envBool("K6_INCLUDE_GALLERY_VIEW")} POST_MUTATIONS=${!!cfg.includeGalleryPostMutations}`
  );
  console.log(
    `storage:     B2_WRITES=${!!cfg.includeB2Writes} UPLOAD_PRESIGN=${!!cfg.includeUploadPresign} METADATA=${!!cfg.includeMetadataExtract} STRIPE=${!!cfg.includeStripe} UPLOAD_CREATE=${!!cfg.includeUploadSessionCreate}`
  );
  console.log(
    `ids:         GALLERY_ID=${boolMark(env("GALLERY_ID"))} DRIVE_ID=${boolMark(env("DRIVE_ID"))} FILE_ID=${boolMark(env("FILE_ID"))} ORG_ID=${boolMark(env("ORGANIZATION_ID"))}`
  );
  console.log(
    `test ids:    TEST_GALLERY_ID=${boolMark(env("TEST_GALLERY_ID"))} TEST_ASSET_IDS=${boolMark(env("TEST_ASSET_IDS"))} TEST_DISPOSABLE_DRIVE_ID=${boolMark(env("TEST_DISPOSABLE_DRIVE_ID"))} TEST_BACKUP_FILE_ID=${boolMark(env("TEST_BACKUP_FILE_ID"))}`
  );
  console.log(`tokens:      BEARER=${maskToken(tok)} INVALID_BEARER=${maskToken(inv)}`);
  console.log("================================");
  console.log("");
}

/**
 * Legacy / convenience: read boolean flags from env for bizzi-api.js
 */
export function readBizziApiMutationFlags() {
  return {
    includeB2Writes: env("K6_ENABLE_B2_WRITES") === "1",
    includeUploadPresign: env("K6_INCLUDE_UPLOAD_URL_PRESIGN") === "1",
    includeMetadataExtract: env("K6_INCLUDE_METADATA_EXTRACT") === "1",
    includeStripe: env("K6_INCLUDE_STRIPE") === "1",
    includeUploadSessionCreate: env("K6_ENABLE_UPLOAD_SESSION_CREATE") === "1",
  };
}
