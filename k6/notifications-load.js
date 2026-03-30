/**
 * Normal traffic only: notification list + count.
 *
 * Required: BASE_URL, BEARER_TOKEN
 * See k6/README.md for guards and JSON output.
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { assertK6Ready } from "./lib/guards.js";
import { env, envInt, envBool } from "./lib/env.js";
import { buildExecutorOptions, buildNormalThresholds } from "./lib/options.js";
import { getBaseUrl, buildTags, authHeadersJson, jitter } from "./lib/http.js";
import { recordIf5xx, bizziExpectedSuccess } from "./lib/metrics.js";

export function setup() {
  assertK6Ready({
    script: "notifications-load",
    requires: ["BASE_URL", "BEARER_TOKEN"],
  });

  if (!envBool("K6_SKIP_AUTH_PROBE")) {
    const b = getBaseUrl();
    const res = http.get(`${b}/api/notifications?limit=1`, {
      headers: authHeadersJson(),
    });
    if (res.status < 200 || res.status >= 300) {
      const snippet =
        res.status === 0
          ? "(no response — wrong BASE_URL, server down, or connection refused)"
          : String(res.body).replace(/\s+/g, " ").slice(0, 320);
      throw new Error(
        `[k6 notifications-load] Auth probe failed: HTTP ${res.status} — ${snippet}\n` +
          "Use a fresh Firebase ID token (Browser → Network → any /api call → Authorization Bearer …).\n" +
          "Confirm FIREBASE_SERVICE_ACCOUNT_JSON project matches your app token (audience bizzi-cloud).\n" +
          "Or set K6_SKIP_AUTH_PROBE=1 to skip this check."
      );
    }
  }

  return {};
}

export const options = buildExecutorOptions("default", buildNormalThresholds());

export default function notificationsLoad() {
  const b = getBaseUrl();
  const h = authHeadersJson();
  const limit = envInt("K6_NOTIFICATIONS_LIMIT", 20);
  const roll = Math.random();

  if (roll < 0.5) {
    const tags = buildTags("notifications", "list", "normal", "no");
    const res = http.get(`${b}/api/notifications?limit=${limit}`, { headers: h, tags });
    if (envBool("K6_DEBUG_HTTP") && res.status >= 300) {
      console.error(`[k6 debug] GET /api/notifications → ${res.status} ${String(res.body).slice(0, 240)}`);
    }
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "notifications 2xx": (r) => r.status >= 200 && r.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
  } else {
    const tags = buildTags("notifications", "count", "normal", "no");
    const res = http.get(`${b}/api/notifications/count`, { headers: h, tags });
    if (envBool("K6_DEBUG_HTTP") && res.status >= 300) {
      console.error(`[k6 debug] GET /api/notifications/count → ${res.status} ${String(res.body).slice(0, 240)}`);
    }
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "notifications count 2xx": (r) => r.status >= 200 && r.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
  }
  sleep(jitter());
}
