/**
 * Normal traffic only: file browser / workspace reads.
 *
 * Required: BASE_URL, BEARER_TOKEN, DRIVE_ID
 * Optional: FILE_ID, ORGANIZATION_ID, TEAM_OWNER_ID, WORKSPACE_ID (for recent-opens / workspaces)
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { assertK6Ready } from "./lib/guards.js";
import { env, envInt } from "./lib/env.js";
import { buildExecutorOptions, buildNormalThresholds } from "./lib/options.js";
import { getBaseUrl, buildTags, authHeadersJson, jitter } from "./lib/http.js";
import { recordIf5xx, bizziExpectedSuccess } from "./lib/metrics.js";

export function setup() {
  assertK6Ready({
    script: "files-browser-load",
    requires: ["BASE_URL", "BEARER_TOKEN", "DRIVE_ID"],
  });
  return {};
}

export const options = buildExecutorOptions("default", buildNormalThresholds());

export default function filesBrowserLoad() {
  const b = getBaseUrl();
  const h = authHeadersJson();
  const driveId = env("DRIVE_ID");
  const fileId = env("FILE_ID", "");
  const orgId = env("ORGANIZATION_ID", "");
  const teamOwnerId = env("TEAM_OWNER_ID", "");
  const workspaceId = env("WORKSPACE_ID", "");
  const r = Math.random();

  if (r < 0.45) {
    let q = `search=${encodeURIComponent("k6")}&drive_id=${encodeURIComponent(driveId)}`;
    const tags = buildTags("files", "filter", "normal", "no");
    const res = http.get(`${b}/api/files/filter?${q}`, { headers: h, tags });
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "filter 2xx": (x) => x.status >= 200 && x.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
  } else if (r < 0.62) {
    let q = `drive_ids=${encodeURIComponent(driveId)}&personal=1`;
    const tags = buildTags("files", "drive_item_counts", "normal", "no");
    const res = http.get(`${b}/api/files/drive-item-counts?${q}`, { headers: h, tags });
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "drive-item-counts 2xx": (x) => x.status >= 200 && x.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
  } else if (r < 0.72 && orgId) {
    let q = `organization_id=${encodeURIComponent(orgId)}&drive_id=${encodeURIComponent(driveId)}`;
    const tags = buildTags("files", "workspaces_list", "normal", "no");
    const res = http.get(`${b}/api/workspaces/list?${q}`, { headers: h, tags });
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "workspaces list 2xx": (x) => x.status >= 200 && x.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
  } else if (r < 0.82) {
    const tags = buildTags("files", "account_workspaces", "normal", "no");
    const res = http.get(`${b}/api/account/workspaces`, { headers: h, tags });
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "account workspaces 2xx": (x) => x.status >= 200 && x.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
  } else if (r < 0.92 && fileId) {
    const tags = buildTags("files", "file_metadata", "normal", "no");
    const res = http.get(`${b}/api/files/${encodeURIComponent(fileId)}`, { headers: h, tags });
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "file by id 2xx": (x) => x.status >= 200 && x.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
  } else {
    let q = `limit=${envInt("K6_RECENT_OPENS_LIMIT", 30)}&context=personal`;
    if (orgId) {
      q = `limit=${envInt("K6_RECENT_OPENS_LIMIT", 30)}&context=enterprise&organization_id=${encodeURIComponent(orgId)}`;
    } else if (teamOwnerId) {
      q = `limit=${envInt("K6_RECENT_OPENS_LIMIT", 30)}&context=team&team_owner_id=${encodeURIComponent(teamOwnerId)}`;
    }
    if (workspaceId) q += `&workspace_id=${encodeURIComponent(workspaceId)}`;
    const tags = buildTags("files", "recent_opens", "normal", "no");
    const res = http.get(`${b}/api/recent-opens?${q}`, { headers: h, tags });
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "recent-opens 2xx": (x) => x.status >= 200 && x.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
  }

  sleep(jitter());
}
