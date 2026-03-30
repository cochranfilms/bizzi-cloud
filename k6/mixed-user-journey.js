/**
 * Normal blended traffic only (no abuse scenarios).
 * Does not hit GET /gallery/view unless K6_INCLUDE_GALLERY_VIEW=1 and analytics/mutation guards pass.
 *
 * Required: BASE_URL, BEARER_TOKEN, DRIVE_ID, GALLERY_ID
 * Optional: FILE_ID, ORGANIZATION_ID, TEAM_OWNER_ID, WORKSPACE_ID, GALLERY_PASSWORD, SHARE_TOKEN
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { assertK6Ready } from "./lib/guards.js";
import { env, envBool, envInt } from "./lib/env.js";
import { buildExecutorOptions, buildNormalThresholds } from "./lib/options.js";
import { getBaseUrl, buildTags, authHeadersJson, postJson, jitter } from "./lib/http.js";
import { recordIf5xx, bizziExpectedSuccess } from "./lib/metrics.js";

export function setup() {
  assertK6Ready({
    script: "mixed-user-journey",
    requires: ["BASE_URL", "BEARER_TOKEN", "DRIVE_ID", "GALLERY_ID"],
    includeGalleryView: envBool("K6_INCLUDE_GALLERY_VIEW"),
  });
  return {};
}

export const options = buildExecutorOptions("default", buildNormalThresholds());

const W_P = () => envInt("K6_MIX_WEIGHT_PUBLIC", 40);
const W_F = () => envInt("K6_MIX_WEIGHT_FILES", 20);
const W_PR = () => envInt("K6_MIX_WEIGHT_PROOFING_READ", 20);
const W_A = () => envInt("K6_MIX_WEIGHT_AUTH", 10);
const W_T = () => envInt("K6_MIX_WEIGHT_TEAM", 10);

function pwQs() {
  const p = env("GALLERY_PASSWORD", "");
  return p ? `?password=${encodeURIComponent(p)}` : "";
}

export default function mixedJourney() {
  const b = getBaseUrl();
  const h = authHeadersJson();
  const driveId = env("DRIVE_ID");
  const gid = env("GALLERY_ID");
  const orgId = env("ORGANIZATION_ID", "");
  const shareToken = env("SHARE_TOKEN", "");
  const includeView = envBool("K6_INCLUDE_GALLERY_VIEW");
  const pw = pwQs();
  const total = Math.max(1, W_P() + W_F() + W_PR() + W_A() + W_T());
  const r = Math.random() * total;
  let acc = 0;

  acc += W_P();
  if (r < acc) {
    if (includeView && Math.random() < 0.35) {
      const tags = buildTags("gallery", "view", "normal", "yes");
      const res = http.get(`${b}/api/galleries/${encodeURIComponent(gid)}/view${pw}`, { tags });
      const bad = recordIf5xx(res.status);
      const ok = check(res, { "view ok": (x) => (x.status >= 200 && x.status < 300) || x.status === 403 });
      if (!bad && ok && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
    } else if (shareToken && Math.random() < 0.25) {
      const tags = buildTags("gallery", "share_get", "normal", "no");
      const res = http.get(`${b}/api/shares/${encodeURIComponent(shareToken)}`, { tags });
      const bad = recordIf5xx(res.status);
      if (!bad && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
      check(res, { share: (x) => x.status < 500 });
    } else {
      const tags = buildTags("gallery", "comments_get", "normal", "no");
      const res = http.get(`${b}/api/galleries/${encodeURIComponent(gid)}/comments${pw}`, { tags });
      const bad = recordIf5xx(res.status);
      if (!bad && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
      check(res, { comments: (x) => x.status < 500 });
    }
    sleep(jitter());
    return;
  }

  acc += W_F();
  if (r < acc) {
    const fileId = env("FILE_ID", "");
    const teamOwnerId = env("TEAM_OWNER_ID", "");
    const workspaceId = env("WORKSPACE_ID", "");
    if (Math.random() < 0.65) {
      let q = `search=${encodeURIComponent("k6")}&drive_id=${encodeURIComponent(driveId)}`;
      const tags = buildTags("files", "filter", "normal", "no");
      const res = http.get(`${b}/api/files/filter?${q}`, { headers: h, tags });
      const bad = recordIf5xx(res.status);
      const ok = check(res, { filter: (x) => x.status >= 200 && x.status < 300 });
      if (!bad && ok) bizziExpectedSuccess.add(1);
    } else if (fileId && Math.random() < 0.5) {
      const tags = buildTags("files", "file_metadata", "normal", "no");
      const res = http.get(`${b}/api/files/${encodeURIComponent(fileId)}`, { headers: h, tags });
      const bad = recordIf5xx(res.status);
      if (!bad && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
      check(res, { file: (x) => x.status < 500 });
    } else {
      let q2 = `limit=20&context=personal`;
      if (orgId) q2 = `limit=20&context=enterprise&organization_id=${encodeURIComponent(orgId)}`;
      else if (teamOwnerId) q2 = `limit=20&context=team&team_owner_id=${encodeURIComponent(teamOwnerId)}`;
      if (workspaceId) q2 += `&workspace_id=${encodeURIComponent(workspaceId)}`;
      const tags = buildTags("files", "recent_opens", "normal", "no");
      const res = http.get(`${b}/api/recent-opens?${q2}`, { headers: h, tags });
      const bad = recordIf5xx(res.status);
      if (!bad && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
      check(res, { recent: (x) => x.status < 500 });
    }
    sleep(jitter());
    return;
  }

  acc += W_PR();
  if (r < acc) {
    const tags = buildTags("proofing", "favorites_get", "normal", "no");
    const res = http.get(`${b}/api/galleries/${encodeURIComponent(gid)}/favorites${pw}`, { tags });
    const bad = recordIf5xx(res.status);
    if (!bad && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
    check(res, { favorites: (x) => x.status < 500 });
    sleep(jitter());
    return;
  }

  acc += W_A();
  if (r < acc) {
    if (Math.random() < 0.6) {
      const tags = buildTags("auth", "profile", "normal", "no");
      const res = http.get(`${b}/api/profile`, { headers: h, tags });
      const bad = recordIf5xx(res.status);
      const ok = check(res, { profile: (x) => x.status >= 200 && x.status < 300 });
      if (!bad && ok) bizziExpectedSuccess.add(1);
    } else {
      const tags = buildTags("auth", "auth_status", "normal", "no");
      const res = http.get(`${b}/api/backup/auth-status`, { tags });
      const bad = recordIf5xx(res.status);
      const ok = check(res, { auth_status: (x) => x.status >= 200 && x.status < 300 });
      if (!bad && ok) bizziExpectedSuccess.add(1);
    }
    sleep(jitter());
    return;
  }

  if (orgId && Math.random() < 0.55) {
    const q = `organization_id=${encodeURIComponent(orgId)}&drive_id=${encodeURIComponent(driveId)}`;
    const tags = buildTags("team", "workspaces_list", "normal", "no");
    const res = http.get(`${b}/api/workspaces/list?${q}`, { headers: h, tags });
    const bad = recordIf5xx(res.status);
    if (!bad && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
    check(res, { workspaces: (x) => x.status < 500 });
  } else {
    const tags = buildTags("storage", "upload_url_validate", "normal", "no");
    const res = postJson("/api/backup/upload-url", { validate_only: true }, tags);
    const bad = recordIf5xx(res.status);
    if (!bad && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
    check(res, { validate: (x) => x.status < 500 });
  }
  sleep(jitter());
}
