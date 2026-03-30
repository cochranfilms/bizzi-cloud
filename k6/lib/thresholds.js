import { envInt } from "./env.js";

export function buildNormalThresholds() {
  const p95 = envInt("K6_THRESHOLD_P95_MS", 30000);
  const p99 = envInt("K6_THRESHOLD_P99_MS", 60000);
  return {
    http_req_failed: ["rate<0.01"],
    http_req_duration: [`p(95)<${p95}`, `p(99)<${p99}`],
  };
}

/**
 * Abuse / rate-limit: emphasize checks + absence of 5xx storms.
 */
export function buildAbuseThresholds() {
  const p95 = envInt("K6_THRESHOLD_P95_MS", 30000);
  return {
    checks: ["rate>0.80"],
    bizzi_unexpected_5xx_rate: ["rate<0.05"],
    http_req_duration: [`p(95)<${p95}`],
  };
}
