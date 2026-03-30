/**
 * Abuse only: invalid / missing credentials on protected routes.
 * Success = expected 401/403 (and no 5xx storm).
 *
 * Required: BASE_URL
 * Optional: INVALID_BEARER_TOKEN (default junk JWT-shaped string)
 * Optional: K6_INCLUDE_AUTH_STATUS_TEST=1 for GET /api/backup/auth-status?test=1 (heavier)
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { assertK6Ready } from "./lib/guards.js";
import { env, envBool } from "./lib/env.js";
import { buildExecutorOptions, buildAbuseThresholds } from "./lib/options.js";
import { getBaseUrl, buildTags, jitter } from "./lib/http.js";
import { recordIf5xx, bizziExpectedDenial, bizziExpectedThrottle } from "./lib/metrics.js";

export function setup() {
  assertK6Ready({
    script: "auth-abuse",
    requires: ["BASE_URL"],
  });
  return {};
}

export const options = buildExecutorOptions("default", buildAbuseThresholds());

export default function authAbuse() {
  const b = getBaseUrl();
  const garbage = env("INVALID_BEARER_TOKEN", "eyJhbGciOiJub25lIn0.e30.invalid");
  const r = Math.random();
  const tagsProfileNone = buildTags("auth", "profile", "abuse", "no");
  const tagsProfileBad = buildTags("auth", "profile_bad_token", "abuse", "no");
  const tagsNotif = buildTags("auth", "notifications", "abuse", "no");
  const tagsWs = buildTags("auth", "workspaces_list", "abuse", "no");

  if (envBool("K6_INCLUDE_AUTH_STATUS_TEST") && r < 0.06) {
    const tags = buildTags("auth", "auth_status_test", "abuse", "no");
    const res = http.get(`${b}/api/backup/auth-status?test=1`, { tags });
    recordIf5xx(res.status);
    check(res, { "auth-status test no 5xx": (x) => x.status < 500 });
    sleep(jitter());
    return;
  }

  if (r < 0.35) {
    const res = http.get(`${b}/api/profile`, { tags: tagsProfileNone });
    recordIf5xx(res.status);
    if (res.status === 401 || res.status === 403) bizziExpectedDenial.add(1);
    check(res, { "expect 401 without token": (x) => x.status === 401 });
    sleep(jitter());
    return;
  }

  if (r < 0.65) {
    const res = http.get(`${b}/api/profile`, {
      headers: { Authorization: `Bearer ${garbage}` },
      tags: tagsProfileBad,
    });
    recordIf5xx(res.status);
    if (res.status === 401 || res.status === 403) bizziExpectedDenial.add(1);
    check(res, { "expect 401 invalid token": (x) => x.status === 401 });
    sleep(jitter());
    return;
  }

  if (r < 0.82) {
    const res = http.get(`${b}/api/notifications?limit=5`, {
      headers: { Authorization: `Bearer ${garbage}` },
      tags: tagsNotif,
    });
    recordIf5xx(res.status);
    if (res.status === 401 || res.status === 403) bizziExpectedDenial.add(1);
    check(res, { "expect 401": (x) => x.status === 401 });
    sleep(jitter());
    return;
  }

  const res = http.get(`${b}/api/workspaces/list?organization_id=x&drive_id=y`, {
    tags: tagsWs,
  });
  recordIf5xx(res.status);
  if (res.status === 401 || res.status === 403) bizziExpectedDenial.add(1);
  if (res.status === 429) bizziExpectedThrottle.add(1);
  check(res, { "expect 401 no bearer": (x) => x.status === 401 });
  sleep(jitter());
}
