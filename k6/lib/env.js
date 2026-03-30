/**
 * @param {string} name
 * @param {string} [fallback]
 */
export function env(name, fallback = "") {
  const v = __ENV[name];
  if (v === undefined || v === "") return fallback;
  return String(v);
}

/**
 * @param {string} name
 * @param {boolean} [defaultVal]
 */
export function envBool(name, defaultVal = false) {
  const v = env(name, defaultVal ? "1" : "0").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @param {string} name
 * @param {number} fallback
 */
export function envInt(name, fallback) {
  const v = env(name, "");
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {string} name
 * @param {number} fallback
 */
export function envFloat(name, fallback) {
  const v = env(name, "");
  if (!v) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
