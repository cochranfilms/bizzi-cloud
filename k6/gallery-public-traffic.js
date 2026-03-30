/**
 * Normal public gallery traffic only (no abuse mixed in).
 * GET /api/galleries/:id/view is OFF by default (increments view_count).
 *
 * Required: BASE_URL, GALLERY_ID
 * Optional: GALLERY_PASSWORD, SHARE_TOKEN
 * /view: K6_INCLUDE_GALLERY_VIEW=1 and (K6_ALLOW_MUTATIONS=1 or K6_ALLOW_ANALYTICS_MUTATIONS=1)
 * POST comments/favorites: K6_INCLUDE_GALLERY_POST_MUTATIONS=1 and K6_ALLOW_MUTATIONS=1 and TEST_*
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { assertK6Ready } from "./lib/guards.js";
import { env, envBool } from "./lib/env.js";
import { buildExecutorOptions, buildNormalThresholds } from "./lib/options.js";
import { getBaseUrl, buildTags, authHeadersJson, postJson, jitter } from "./lib/http.js";
import { recordIf5xx, bizziExpectedSuccess } from "./lib/metrics.js";

export function setup() {
  assertK6Ready({
    script: "gallery-public-traffic",
    requires: ["BASE_URL", "GALLERY_ID"],
    includeGalleryView: envBool("K6_INCLUDE_GALLERY_VIEW"),
    includeGalleryPostMutations: envBool("K6_INCLUDE_GALLERY_POST_MUTATIONS"),
  });
  return {};
}

export const options = buildExecutorOptions("default", buildNormalThresholds());

function galleryPasswordQs() {
  const p = env("GALLERY_PASSWORD", "");
  return p ? `?password=${encodeURIComponent(p)}` : "";
}

function parseAssetIds() {
  const raw = env("TEST_ASSET_IDS", "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function galleryPublic() {
  const b = getBaseUrl();
  const gid = env("GALLERY_ID");
  const pw = galleryPasswordQs();
  const shareToken = env("SHARE_TOKEN", "");
  const includeView = envBool("K6_INCLUDE_GALLERY_VIEW");
  const includePosts = envBool("K6_INCLUDE_GALLERY_POST_MUTATIONS");
  const roll = Math.random();

  if (includePosts && roll < 0.08) {
    const testGid = env("TEST_GALLERY_ID");
    const ids = parseAssetIds();
    const tags = buildTags("gallery", "favorites_post", "normal", "yes");
    const res = postJson(
      `/api/galleries/${encodeURIComponent(testGid)}/favorites${pw ? pw : ""}`,
      { asset_ids: ids.length ? ids : ["invalid-id"], client_name: "k6", title: "k6" },
      tags,
      ""
    );
    const bad = recordIf5xx(res.status);
    check(res, { "post accepted or expected 4xx": (r) => r.status >= 200 && r.status < 500 });
    if (!bad && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
    sleep(jitter());
    return;
  }

  if (includeView && roll < 0.35) {
    const tags = buildTags("gallery", "view", "normal", "yes");
    const res = http.get(`${b}/api/galleries/${encodeURIComponent(gid)}/view${pw}`, { tags });
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "view 2xx or 403": (r) => (r.status >= 200 && r.status < 300) || r.status === 403 });
    if (!bad && ok && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
    sleep(jitter());
    return;
  }

  if (roll < 0.55 || !includeView) {
    const tags = buildTags("gallery", "comments_get", "normal", "no");
    const res = http.get(`${b}/api/galleries/${encodeURIComponent(gid)}/comments${pw}`, { tags });
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "cs 2xx or 403": (r) => (r.status >= 200 && r.status < 300) || r.status === 403 });
    if (!bad && ok && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
    sleep(jitter());
    return;
  }

  if (shareToken && roll < 0.85) {
    const tags = buildTags("gallery", "share_get", "normal", "no");
    const res = http.get(`${b}/api/shares/${encodeURIComponent(shareToken)}`, { tags });
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "share 2xx or 403 or 410": (r) => r.status < 500 });
    if (!bad && ok && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
    sleep(jitter());
    return;
  }

  const tags = buildTags("gallery", "favorites_get", "normal", "no");
  const res = http.get(`${b}/api/galleries/${encodeURIComponent(gid)}/favorites${pw}`, { tags });
  const bad = recordIf5xx(res.status);
  const ok = check(res, { "favorites get 2xx or 403": (r) => (r.status >= 200 && r.status < 300) || r.status === 403 });
  if (!bad && ok && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
  sleep(jitter());
}
