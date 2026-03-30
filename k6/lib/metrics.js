import { Counter, Rate } from "k6/metrics";

/** 2xx when the iteration expected success */
export const bizziExpectedSuccess = new Counter("bizzi_outcome_expected_success");
/** 401/403 when the iteration expected denial */
export const bizziExpectedDenial = new Counter("bizzi_outcome_expected_denial");
/** 429 when the iteration expected throttle */
export const bizziExpectedThrottle = new Counter("bizzi_outcome_expected_throttle");
/** Count of unexpected 5xx responses */
export const bizziUnexpected5xx = new Counter("bizzi_outcome_unexpected_5xx");
/** Sample-level rate: 1 if 5xx, else 0 (for `bizzi_unexpected_5xx_rate` thresholds) */
export const bizziUnexpected5xxRate = new Rate("bizzi_unexpected_5xx_rate");

/**
 * @param {number} status
 * @returns {boolean} true if status is 5xx (and recorded)
 */
export function recordIf5xx(status) {
  if (status >= 500 && status < 600) {
    bizziUnexpected5xx.add(1);
    bizziUnexpected5xxRate.add(1);
    return true;
  }
  bizziUnexpected5xxRate.add(0);
  return false;
}
