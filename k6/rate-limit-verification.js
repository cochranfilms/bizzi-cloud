/**
 * Single-route throttle verification (not a multi-route suite).
 *
 * Required: BASE_URL, BEARER_TOKEN, DRIVE_ID, K6_RATE_LIMIT_ROUTE
 * See closed enum in k6/README.md.
 *
 * K6_RATE_LIMIT_EXPECT_STATUS (default 429)
 * K6_RATE_LIMIT_AFTER_COOLDOWN_EXPECT_STATUS (default 200)
 * K6_RATE_LIMIT_COOLDOWN_MS (default 65000) — serverless limits are per-instance; tune if needed
 * K6_RATE_LIMIT_HAMMER_REQUESTS (default 400)
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { assertK6Ready } from "./lib/guards.js";
import { env, envInt } from "./lib/env.js";
import { buildExecutorOptions, buildAbuseThresholds } from "./lib/options.js";
import { getBaseUrl, buildTags, authHeadersJson } from "./lib/http.js";
import { recordIf5xx, bizziExpectedThrottle } from "./lib/metrics.js";

export function setup() {
  const route = env("K6_RATE_LIMIT_ROUTE", "");
  const allowed = new Set(["files_filter", "drive_item_counts"]);
  if (!route || !allowed.has(route)) {
    throw new Error(
      "[k6] K6_RATE_LIMIT_ROUTE must be set to a documented enum value. See k6/README.md"
    );
  }
  assertK6Ready({
    script: "rate-limit-verification",
    requires: ["BASE_URL", "BEARER_TOKEN", "DRIVE_ID"],
  });
  return {};
}

export const options = buildExecutorOptions("default", buildAbuseThresholds());

const expectThrottle = envInt("K6_RATE_LIMIT_EXPECT_STATUS", 429);
const expectAfter = envInt("K6_RATE_LIMIT_AFTER_COOLDOWN_EXPECT_STATUS", 200);
const cooldownMs = envInt("K6_RATE_LIMIT_COOLDOWN_MS", 65000);
const hammerMax = envInt("K6_RATE_LIMIT_HAMMER_REQUESTS", 400);

function hammerUrl() {
  const b = getBaseUrl();
  const driveId = env("DRIVE_ID");
  const ROUTE = env("K6_RATE_LIMIT_ROUTE", "");
  if (ROUTE === "files_filter") {
    const q = `search=${encodeURIComponent("k6")}&drive_id=${encodeURIComponent(driveId)}`;
    return { url: `${b}/api/files/filter?${q}`, routeKey: "files_filter" };
  }
  if (ROUTE === "drive_item_counts") {
    const q = `drive_ids=${encodeURIComponent(driveId)}&personal=1`;
    return { url: `${b}/api/files/drive-item-counts?${q}`, routeKey: "drive_item_counts" };
  }
  throw new Error("unreachable");
}

export default function rateLimitVerify() {
  const h = authHeadersJson();
  const { url, routeKey } = hammerUrl();
  const tagsHammer = buildTags("rate_limit", routeKey, "abuse", "no");
  const tagsRecover = buildTags("rate_limit", `${routeKey}_cooldown`, "abuse", "no");

  let sawThrottle = false;
  for (let i = 0; i < hammerMax; i++) {
    const res = http.get(url, { headers: h, tags: tagsHammer });
    if (recordIf5xx(res.status)) {
      check(res, { "no 5xx during hammer": () => false });
      return;
    }
    if (res.status === expectThrottle) {
      sawThrottle = true;
      bizziExpectedThrottle.add(1);
      break;
    }
  }

  check(null, { "saw expected throttle": () => sawThrottle });

  sleep(cooldownMs / 1000);

  const res2 = http.get(url, { headers: h, tags: tagsRecover });
  recordIf5xx(res2.status);
  check(res2, {
    "recovery status": (r) => r.status === expectAfter,
  });

  sleep(0.2);
}
