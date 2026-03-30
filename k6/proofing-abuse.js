/**
 * Abuse only: malformed / unauthenticated proofing calls.
 *
 * Required: BASE_URL, GALLERY_ID
 * Optional: GALLERY_PASSWORD (for wrong-password attempts)
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { assertK6Ready } from "./lib/guards.js";
import { env } from "./lib/env.js";
import { buildExecutorOptions, buildAbuseThresholds } from "./lib/options.js";
import { getBaseUrl, buildTags, postJson, jitter } from "./lib/http.js";
import { recordIf5xx, bizziExpectedDenial } from "./lib/metrics.js";

export function setup() {
  assertK6Ready({
    script: "proofing-abuse",
    requires: ["BASE_URL", "GALLERY_ID"],
  });
  return {};
}

export const options = buildExecutorOptions("default", buildAbuseThresholds());

const garbage = env("INVALID_BEARER_TOKEN", "eyJhbGciOiJub25lIn0.e30.invalid");

export default function proofingAbuse() {
  const b = getBaseUrl();
  const gid = env("GALLERY_ID");
  const badListId = "k6-nonexistent-list";
  const r = Math.random();

  if (r < 0.2) {
    const tags = buildTags("proofing", "proofing_merge_no_auth", "abuse", "no");
    const res = postJson(`/api/galleries/${encodeURIComponent(gid)}/proofing-merge`, {}, tags, "");
    recordIf5xx(res.status);
    if (res.status === 401) bizziExpectedDenial.add(1);
    check(res, { "merge unauth 401": (x) => x.status === 401 });
    sleep(jitter());
    return;
  }

  if (r < 0.38) {
    const tags = buildTags("proofing", "materialize_no_auth", "abuse", "no");
    const res = http.post(
      `${b}/api/galleries/${encodeURIComponent(gid)}/favorites/${badListId}/materialize`,
      "{}",
      { headers: { "Content-Type": "application/json" }, tags }
    );
    recordIf5xx(res.status);
    if (res.status === 401) bizziExpectedDenial.add(1);
    check(res, { "materialize unauth 401": (x) => x.status === 401 });
    sleep(jitter());
    return;
  }

  if (r < 0.55) {
    const tags = buildTags("proofing", "favorites_bad_body", "abuse", "no");
    const res = http.post(
      `${b}/api/galleries/${encodeURIComponent(gid)}/favorites`,
      "{ not json",
      { headers: { "Content-Type": "application/json" }, tags }
    );
    recordIf5xx(res.status);
    if (res.status >= 400 && res.status < 500) bizziExpectedDenial.add(1);
    check(res, { "bad body 4xx": (x) => x.status >= 400 && x.status < 500 });
    sleep(jitter());
    return;
  }

  if (r < 0.72) {
    const tags = buildTags("proofing", "selects_empty_ids", "abuse", "no");
    const res = postJson(
      `/api/galleries/${encodeURIComponent(gid)}/selects`,
      { asset_ids: [], client_name: "k6" },
      tags,
      ""
    );
    recordIf5xx(res.status);
    if (res.status >= 400 && res.status < 500) bizziExpectedDenial.add(1);
    check(res, { "empty ids 4xx": (x) => x.status >= 400 && x.status < 500 });
    sleep(jitter());
    return;
  }

  if (r < 0.86) {
    const tags = buildTags("proofing", "merge_bad_token", "abuse", "no");
    const res = postJson(
      `/api/galleries/${encodeURIComponent(gid)}/proofing-merge`,
      {},
      tags,
      garbage
    );
    recordIf5xx(res.status);
    if (res.status === 401) bizziExpectedDenial.add(1);
    check(res, { "merge bad token 401": (x) => x.status === 401 });
    sleep(jitter());
    return;
  }

  const tags = buildTags("proofing", "view_wrong_password", "abuse", "no");
  const res = http.get(
    `${b}/api/galleries/${encodeURIComponent(gid)}/view?password=${encodeURIComponent("definitely-wrong-password-k6")}`,
    { tags }
  );
  recordIf5xx(res.status);
  if (res.status === 403) bizziExpectedDenial.add(1);
  check(res, { "wrong password 403 or 401": (x) => x.status === 403 || x.status === 401 });
  sleep(jitter());
}
