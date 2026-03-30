/**
 * Legacy umbrella load mix (all behavior classes combined).
 * Prefer feature-specific scripts under k6/*.js for clearer thresholds.
 *
 * Prerequisites: k6 on PATH.
 *
 * Required: BASE_URL
 * Optional: BEARER_TOKEN, DRIVE_ID, GALLERY_ID, FILE_ID, OBJECT_KEY,
 *   TEST_DISPOSABLE_DRIVE_ID (required when B2/presign/upload-create flags on),
 *   TEST_BACKUP_FILE_ID (when K6_INCLUDE_METADATA_EXTRACT=1)
 *
 * Dangerous flags require K6_ALLOW_MUTATIONS=1:
 *   K6_ENABLE_B2_WRITES, K6_INCLUDE_UPLOAD_URL_PRESIGN, K6_INCLUDE_METADATA_EXTRACT,
 *   K6_INCLUDE_STRIPE, K6_ENABLE_UPLOAD_SESSION_CREATE
 *
 * Executor: K6_EXECUTOR=ramping-vus | constant-vus | ramping-arrival-rate (default ramping-vus)
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { env } from "./lib/env.js";
import { assertK6Ready, readBizziApiMutationFlags } from "./lib/guards.js";
import { buildBizziMixOptions } from "./lib/options.js";
import { getBaseUrl, buildTags, authHeadersJson, postJson, jitter } from "./lib/http.js";

export function setup() {
  const flags = readBizziApiMutationFlags();
  assertK6Ready({
    script: "bizzi-api",
    requires: ["BASE_URL"],
    includeB2Writes: flags.includeB2Writes,
    includeUploadPresign: flags.includeUploadPresign,
    includeMetadataExtract: flags.includeMetadataExtract,
    includeStripe: flags.includeStripe,
    includeUploadSessionCreate: flags.includeUploadSessionCreate,
  });
  return {};
}

export const options = buildBizziMixOptions();

function jsonPost(path, body, tags) {
  return postJson(path, body, tags);
}

export default function bizziMix() {
  const flags = readBizziApiMutationFlags();
  const b = getBaseUrl();
  const h = authHeadersJson();
  const driveId = env("DRIVE_ID");
  const testDrive = env("TEST_DISPOSABLE_DRIVE_ID", "");
  const galleryId = env("GALLERY_ID");
  const fileId = env("FILE_ID");
  const objectKey = env("OBJECT_KEY");
  const backupFileId = env("TEST_BACKUP_FILE_ID", "");
  const planId = env("K6_PLAN_ID", "solo");

  if (flags.includeB2Writes && testDrive && Math.random() < 0.005) {
    const tags = buildTags("storage", "multipart_init", "normal", "yes");
    const res = jsonPost(
      "/api/backup/multipart-init",
      {
        drive_id: testDrive,
        relative_path: `k6-multipart/${__VU}-${__ITER}.bin`,
        content_type: "application/octet-stream",
        size_bytes: 32 * 1024 * 1024,
      },
      tags
    );
    check(res, { "multipart-init 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (flags.includeUploadPresign && testDrive && Math.random() < 0.008) {
    const tags = buildTags("storage", "upload_url_presign", "normal", "yes");
    const res = jsonPost(
      "/api/backup/upload-url",
      {
        drive_id: testDrive,
        relative_path: `k6-load/${__VU}-${__ITER}.bin`,
        content_type: "application/octet-stream",
        size_bytes: 1024,
      },
      tags
    );
    check(res, { "upload-url presign 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (flags.includeMetadataExtract && backupFileId && Math.random() < 0.003) {
    const tags = buildTags("storage", "extract_metadata", "normal", "yes");
    const res = jsonPost("/api/files/extract-metadata", { backup_file_id: backupFileId }, tags);
    check(res, { "extract-metadata responded": (r) => r.status >= 200 && r.status < 500 });
    sleep(1);
    return;
  }

  if (flags.includeStripe && Math.random() < 0.005) {
    if (Math.random() < 0.7) {
      const tags = buildTags("storage", "stripe_preview", "normal", "yes");
      const res = jsonPost(
        "/api/stripe/subscription-preview",
        { planId, addonIds: [], billing: "monthly", storageAddonId: null },
        tags
      );
      check(res, { "subscription-preview 2xx": (r) => r.status >= 200 && r.status < 300 });
    } else {
      const res = http.post(`${b}/api/stripe/portal`, "{}", {
        headers: { ...h, "Content-Type": "application/json" },
        tags: buildTags("storage", "stripe_portal", "normal", "yes"),
      });
      check(res, {
        "portal ok or expected fail": (r) =>
          (r.status >= 200 && r.status < 300) || r.status === 400 || r.status === 404,
      });
    }
    sleep(jitter());
    return;
  }

  if (flags.includeUploadSessionCreate && testDrive && Math.random() < 0.004) {
    const tags = buildTags("storage", "upload_create", "normal", "yes");
    const res = jsonPost(
      "/api/uploads/create",
      {
        drive_id: testDrive,
        relative_path: `k6-umbrella/${__VU}-${__ITER}.bin`,
        content_type: "application/octet-stream",
        size_bytes: 1024,
        file_name: "k6.bin",
      },
      tags
    );
    check(res, { "upload create responded": (r) => r.status >= 200 && r.status < 500 });
    sleep(jitter());
    return;
  }

  const roll = Math.random();

  if (roll < 0.06) {
    const res = http.get(`${b}/api/backup/auth-status`, {
      tags: buildTags("auth", "auth_status", "normal", "no"),
    });
    check(res, { "auth-status 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.18) {
    const res = http.get(`${b}/api/profile`, {
      headers: h,
      tags: buildTags("auth", "profile", "normal", "no"),
    });
    check(res, { "profile 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.38) {
    let q = `search=${encodeURIComponent("k6")}`;
    if (driveId) q += `&drive_id=${encodeURIComponent(driveId)}`;
    const res = http.get(`${b}/api/files/filter?${q}`, {
      headers: h,
      tags: buildTags("files", "filter", "normal", "no"),
    });
    check(res, { "files/filter 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.5) {
    const res = http.get(`${b}/api/notifications?limit=20`, {
      headers: h,
      tags: buildTags("notifications", "list", "normal", "no"),
    });
    check(res, { "notifications 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.58) {
    const res = http.get(`${b}/api/notifications/count`, {
      headers: h,
      tags: buildTags("notifications", "count", "normal", "no"),
    });
    check(res, { "notifications/count 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.72) {
    const res = http.get(`${b}/api/galleries`, {
      headers: h,
      tags: buildTags("gallery", "galleries_list", "normal", "no"),
    });
    check(res, { "galleries 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.8 && galleryId) {
    const res = http.get(`${b}/api/galleries/${encodeURIComponent(galleryId)}`, {
      headers: h,
      tags: buildTags("gallery", "gallery_by_id", "normal", "no"),
    });
    check(res, { "gallery by id 2xx": (r) => r.status >= 200 && r.status < 300 });
    sleep(jitter());
    return;
  }

  if (roll < 0.88 && fileId) {
    const res = http.get(`${b}/api/files/${encodeURIComponent(fileId)}`, {
      headers: h,
      tags: buildTags("files", "file_metadata", "normal", "no"),
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
      tags: buildTags("files", "mount_range", "normal", "no"),
    });
    check(res, {
      "range redirect or ok": (r) => r.status === 302 || r.status === 200 || r.status === 206,
    });
    sleep(jitter());
    return;
  }

  const res = jsonPost("/api/backup/upload-url", { validate_only: true }, buildTags("storage", "upload_url_validate", "normal", "no"));
  check(res, { "upload-url validate 2xx": (r) => r.status >= 200 && r.status < 300 });
  sleep(jitter());
}
