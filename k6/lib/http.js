import http from "k6/http";
import { env } from "./env.js";

/**
 * Trim, default missing scheme to https, strip trailing slash.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeBaseUrl(raw) {
  let u = String(raw).trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u}`;
  }
  return u.replace(/\/$/, "");
}

/**
 * @returns {string}
 */
export function getBaseUrl() {
  const u = normalizeBaseUrl(env("BASE_URL"));
  if (!u) {
    throw new Error("[k6] BASE_URL is required");
  }
  return u;
}

/**
 * Standard request tags for dashboards / JSON output.
 * @param {string} area
 * @param {string} route
 * @param {"normal"|"abuse"} mode
 * @param {"yes"|"no"} mutation
 * @param {string} [shell]
 */
export function buildTags(area, route, mode, mutation, shell) {
  /** @type {Record<string, string>} */
  const t = {
    area,
    route,
    mode,
    mutation,
    name: `${area}:${route}:${mode}:${mutation}`,
  };
  if (shell) t.shell = shell;
  return t;
}

/**
 * @param {string} [explicitToken] use "" for no Authorization header
 */
export function authHeadersJson(explicitToken) {
  let token = explicitToken !== undefined ? explicitToken : env("BEARER_TOKEN");
  if (typeof token === "string") {
    token = token.trim().replace(/^["']|["']$/g, "");
    if (/^bearer\s+/i.test(token)) {
      token = token.replace(/^bearer\s+/i, "").trim();
    }
  }
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/**
 * @param {string} path
 * @param {string} [explicitToken]
 * @param {Record<string, string>} tags
 */
export function getJson(path, tags, explicitToken) {
  const b = getBaseUrl();
  return http.get(`${b}${path}`, {
    headers: authHeadersJson(explicitToken),
    tags,
  });
}

/**
 * @param {string} path
 * @param {unknown} body
 * @param {Record<string, string>} tags
 * @param {string} [explicitToken]
 */
export function postJson(path, body, tags, explicitToken) {
  const b = getBaseUrl();
  return http.post(`${b}${path}`, JSON.stringify(body), {
    headers: authHeadersJson(explicitToken),
    tags,
  });
}

export function jitter() {
  return (1 + Math.floor(Math.random() * 3)) / 10;
}
