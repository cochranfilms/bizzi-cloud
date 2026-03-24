/**
 * Load tests for bizzi-cloud App Router APIs.
 *
 * Prerequisites:
 *   - k6 on PATH (brew install k6, or install from https://k6.io/docs/get-started/installation/)
 *
 * Required env:
 *   - BASE_URL   e.g. http://localhost:3000 or https://your-preview.vercel.app
 *
 * Auth (most routes): Firebase ID token from the signed-in app (Network tab → any /api/* → Authorization).
 *   - BEARER_TOKEN   (refresh often; tokens expire)
 *
 * Optional (enable richer checks; omit to skip that branch):
 *   - DRIVE_ID              for /api/files/filter, multipart/upload-url (non-validate)
 *   - GALLERY_ID            for GET /api/galleries/:id
 *   - FILE_ID               for GET /api/files/:fileId
 *   - OBJECT_KEY            for GET /api/mount/range (must be readable by user)
 *   - BACKUP_FILE_ID        for POST /api/files/extract-metadata (heavy; off by default)
 *   - K6_PLAN_ID            default solo — for POST /api/stripe/subscription-preview
 *
 * Dangerous / side-effecting (off unless explicitly enabled):
 *   - K6_ENABLE_B2_WRITES=1       POST /api/backup/multipart-init (creates real B2 multipart state)
 *   - K6_INCLUDE_STRIPE=1         POST /api/stripe/subscription-preview, /api/stripe/portal (Stripe + your DB)
 *   - K6_INCLUDE_METADATA_EXTRACT=1   POST /api/files/extract-metadata (ffmpeg/B2; very expensive)
 *   - K6_INCLUDE_UPLOAD_URL_PRESIGN=1 POST /api/backup/upload-url without validate_only (B2 presigns)
 *
 * Executor selection (default: ramping-vus 10 → 4000):
 *   - K6_EXECUTOR=ramping-vus | constant-vus | ramping-arrival-rate
 *   - K6_START_VUS, K6_TARGET_VUS, K6_RAMP_DURATION, K6_HOLD_DURATION, K6_RAMP_DOWN_DURATION
 *   - For arrival-rate: K6_START_RATE, K6_STAGE1_DURATION, K6_STAGE1_TARGET, ... (see buildOptions)
 */

import http from "k6/http";
import { check, sleep } from "k6";

function env(name, fallback = "") {
  return __ENV[name] || fallback;
}

function buildOptions() {
  const execName = "bizziMix";

  const constantVus = {
    scenarios: {
      main: {
        executor: "constant-vus",
        vus: parseInt(env("K6_VUS", "10"), 10),
        duration: env("K6_DURATION", "5m"),
        exec: execName,
      },
    },
    thresholds: {
      http_req_failed: ["rate<0.5"],
      http_req_duration: ["p(95)<30000"],
    },
  };

  const rampingArrival = {
    scenarios: {
      main: {
        executor: "ramping-arrival-rate",
        startRate: parseInt(env("K6_START_RATE", "10"), 10),
        timeUnit: "1s",
        preAllocatedVUs: parseInt(env("K6_PREALLOC_VUS", "200"), 10),
        maxVUs: parseInt(env("K6_MAX_VUS", "4000"), 10),
        stages: [
          {
            duration: env("K6_STAGE1_DURATION", "2m"),
            target: parseInt(env("K6_STAGE1_TARGET", "50"), 10),
          },
          {
            duration: env("K6_STAGE2_DURATION", "5m"),
            target: parseInt(env("K6_STAGE2_TARGET", "500"), 10),
          },
          {
            duration: env("K6_STAGE3_DURATION", "5m"),
            target: parseInt(env("K6_STAGE3_TARGET", "2000"), 10),
          },
          {
            duration: env("K6_STAGE4_DURATION", "2m"),
            target: parseInt(env("K6_STAGE4_TARGET", "0"), 10),
          },
        ],
        exec: execName,
      },
    },
    thresholds: {
      http_req_failed: ["rate<0.5"],
      http_req_duration: ["p(95)<30000"],
    },
  };

  const rampingVus = {
    scenarios: {
      main: {
        executor: "ramping-vus",
        startVUs: parseInt(env("K6_START_VUS", "10"), 10),
        stages: [
          {
            duration: env("K6_RAMP_DURATION", "8m"),
            target: parseInt(env("K6_TARGET_VUS", "4000"), 10),
          },
          {
            duration: env("K6_HOLD_DURATION", "2m"),
            target: parseInt(env("K6_TARGET_VUS", "4000"), 10),
          },
          {
            duration: env("K6_RAMP_DOWN_DURATION", "2m"),
            target: 0,
          },
        ],
        gracefulRampDown: "30s",
        exec: execName,
      },
    },
    thresholds: {
      http_req_failed: ["rate<0.5"],
      http_req_duration: ["p(95)<30000"],
    },
  };

  const mode = env("K6_EXECUTOR", "ramping-vus");
  if (mode === "constant-vus") return constantVus;
  if (mode === "ramping-arrival-rate") return rampingArrival;
  return rampingVus;
}

export const options = buildOptions();

function baseUrl() {
  const u = env("BASE_URL");
  if (!u) {
    throw new Error("Set BASE_URL, e.g. BASE_URL=http://localhost:3000 k6 run k6/bizzi-api.js");
  }
  return u.replace(/\/$/, "");
}

function authHeaders() {
  const token = env("BEARER_TOKEN");
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function jsonPost(path, body) {
  return http.post(`${baseUrl()}${path}`, JSON.stringify(body), {
    headers: authHeaders(),
    tags: { name: `POST ${path}` },
  });
}

function jitter() {
  return (1 + Math.floor(Math.random() * 3)) / 10;
}

export function bizziMix() {
  const b = baseUrl();
  const h = authHeaders();
  const driveId = env("DRIVE_ID");
  const galleryId = env("GALLERY_ID");
  const fileId = env("FILE_ID");
  const objectKey = env("OBJECT_KEY");
  const backupFileId = env("BACKUP_FILE_ID");
  const planId = env("K6_PLAN_ID", "solo");

  // Side-effecting paths: small probability when explicitly enabled (see file header).
  if (env("K6_ENABLE_B2_WRITES") === "1" && driveId && Math.random() < 0.005) {
    const res = jsonPost("/api/backup/multipart-init", {
      drive_id: driveId,
      relative_path: `k6-multipart/${__VU}-${__ITER}.bin`,
      content_type: "application/octet-stream",
      size_bytes: 32 * 1024 * 1024,
    });
    check(res, { "multipart-init 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (env("K6_INCLUDE_UPLOAD_URL_PRESIGN") === "1" && driveId && Math.random() < 0.008) {
    const res = jsonPost("/api/backup/upload-url", {
      drive_id: driveId,
      relative_path: `k6-load/${__VU}-${__ITER}.bin`,
      content_type: "application/octet-stream",
      size_bytes: 1024,
    });
    check(res, { "upload-url presign 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (env("K6_INCLUDE_METADATA_EXTRACT") === "1" && backupFileId && Math.random() < 0.003) {
    const res = jsonPost("/api/files/extract-metadata", { backup_file_id: backupFileId });
    check(res, { "extract-metadata responded": (r) => r.status >= 200 && r.status < 500 });
    sleep(1);
    return;
  }

  if (env("K6_INCLUDE_STRIPE") === "1" && Math.random() < 0.005) {
    if (Math.random() < 0.7) {
      const res = jsonPost("/api/stripe/subscription-preview", {
        planId,
        addonIds: [],
        billing: "monthly",
        storageAddonId: null,
      });
      check(res, { "subscription-preview 2xx": (r) => r.status >= 200 && r.status < 300 });
    } else {
      const res = http.post(`${baseUrl()}/api/stripe/portal`, "{}", {
        headers: { ...h, "Content-Type": "application/json" },
        tags: { name: "POST /api/stripe/portal" },
      });
      check(res, {
        "portal ok or expected fail": (r) =>
          (r.status >= 200 && r.status < 300) || r.status === 400 || r.status === 404,
      });
    }
    sleep(jitter());
    return;
  }

  // Weighted mix: favor read-mostly APIs.
  const roll = Math.random();

  if (roll < 0.06) {
    const res = http.get(`${b}/api/backup/auth-status`, {
      tags: { name: "GET /api/backup/auth-status" },
    });
    check(res, { "auth-status 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.18) {
    const res = http.get(`${b}/api/profile`, { headers: h, tags: { name: "GET /api/profile" } });
    check(res, { "profile 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.38) {
    let q = `search=${encodeURIComponent("k6")}`;
    if (driveId) q += `&drive_id=${encodeURIComponent(driveId)}`;
    const res = http.get(`${b}/api/files/filter?${q}`, {
      headers: h,
      tags: { name: "GET /api/files/filter" },
    });
    check(res, { "files/filter 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.5) {
    const res = http.get(`${b}/api/notifications?limit=20`, {
      headers: h,
      tags: { name: "GET /api/notifications" },
    });
    check(res, { "notifications 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.58) {
    const res = http.get(`${b}/api/notifications/count`, {
      headers: h,
      tags: { name: "GET /api/notifications/count" },
    });
    check(res, { "notifications/count 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.72) {
    const res = http.get(`${b}/api/galleries`, { headers: h, tags: { name: "GET /api/galleries" } });
    check(res, { "galleries 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.8 && galleryId) {
    const res = http.get(`${b}/api/galleries/${encodeURIComponent(galleryId)}`, {
      headers: h,
      tags: { name: "GET /api/galleries/:id" },
    });
    check(res, { "gallery by id 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.88 && fileId) {
    const res = http.get(`${b}/api/files/${encodeURIComponent(fileId)}`, {
      headers: h,
      tags: { name: "GET /api/files/:fileId" },
    });
    check(res, { "file metadata 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.93 && objectKey) {
    const qs = `object_key=${encodeURIComponent(objectKey)}`;
    const res = http.get(`${b}/api/mount/range?${qs}`, {
      headers: { ...h, Range: "bytes=0-1023" },
      redirects: 0,
      tags: { name: "GET /api/mount/range" },
    });
    check(res, {
      "range redirect or ok": (r) => r.status === 302 || r.status === 200 || r.status === 206,
    });
    sleep(jitter());
    return;
  }

  // Signed URL path: lightweight token check only (no B2 presign)
  const res = jsonPost("/api/backup/upload-url", { validate_only: true });
  check(res, { "upload-url validate 2xx": (r) => r.status >= 200 && r.status < 300 });
  sleep(jitter());
}
