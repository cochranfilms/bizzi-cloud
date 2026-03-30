/**
 * Mostly normal: upload URL validate-only, storage reads.
 * Data writes only with K6_ALLOW_MUTATIONS + feature flags + TEST_* (see guards).
 *
 * Required: BASE_URL, BEARER_TOKEN
 * Optional flags: K6_ENABLE_B2_WRITES, K6_INCLUDE_UPLOAD_URL_PRESIGN, K6_INCLUDE_METADATA_EXTRACT,
 *   K6_INCLUDE_STRIPE, K6_ENABLE_UPLOAD_SESSION_CREATE
 */
import { check, sleep } from "k6";
import http from "k6/http";
import { assertK6Ready, readBizziApiMutationFlags } from "./lib/guards.js";
import { env } from "./lib/env.js";
import { buildExecutorOptions, buildNormalThresholds } from "./lib/options.js";
import { getBaseUrl, buildTags, authHeadersJson, postJson, jitter } from "./lib/http.js";
import { recordIf5xx, bizziExpectedSuccess } from "./lib/metrics.js";

export function setup() {
  const flags = readBizziApiMutationFlags();
  assertK6Ready({
    script: "upload-and-storage-load",
    requires: ["BASE_URL", "BEARER_TOKEN"],
    includeB2Writes: flags.includeB2Writes,
    includeUploadPresign: flags.includeUploadPresign,
    includeMetadataExtract: flags.includeMetadataExtract,
    includeStripe: flags.includeStripe,
    includeUploadSessionCreate: flags.includeUploadSessionCreate,
  });
  return {};
}

export const options = buildExecutorOptions("default", buildNormalThresholds());

export default function uploadStorageLoad() {
  const flags = readBizziApiMutationFlags();
  const b = getBaseUrl();
  const h = authHeadersJson();
  const testDrive = env("TEST_DISPOSABLE_DRIVE_ID", "");
  const backupFileId = env("TEST_BACKUP_FILE_ID", "");
  const planId = env("K6_PLAN_ID", "solo");

  if (flags.includeB2Writes && testDrive && Math.random() < 0.02) {
    const tags = buildTags("storage", "multipart_init", "normal", "yes");
    const res = postJson(
      "/api/backup/multipart-init",
      {
        drive_id: testDrive,
        relative_path: `k6-multipart/${__VU}-${__ITER}.bin`,
        content_type: "application/octet-stream",
        size_bytes: 32 * 1024 * 1024,
      },
      tags
    );
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "multipart 2xx": (r) => r.status >= 200 && r.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
    sleep(jitter());
    return;
  }

  if (flags.includeUploadPresign && testDrive && Math.random() < 0.03) {
    const tags = buildTags("storage", "upload_url_presign", "normal", "yes");
    const res = postJson(
      "/api/backup/upload-url",
      {
        drive_id: testDrive,
        relative_path: `k6-load/${__VU}-${__ITER}.bin`,
        content_type: "application/octet-stream",
        size_bytes: 1024,
      },
      tags
    );
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "presign 2xx": (r) => r.status >= 200 && r.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
    sleep(jitter());
    return;
  }

  if (flags.includeMetadataExtract && backupFileId && Math.random() < 0.02) {
    const tags = buildTags("storage", "extract_metadata", "normal", "yes");
    const res = postJson("/api/files/extract-metadata", { backup_file_id: backupFileId }, tags);
    const bad = recordIf5xx(res.status);
    check(res, { "extract responded": (r) => r.status >= 200 && r.status < 500 });
    if (!bad && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
    sleep(1);
    return;
  }

  if (flags.includeStripe && Math.random() < 0.02) {
    const tags = buildTags("storage", "stripe_preview", "normal", "yes");
    const res = postJson(
      "/api/stripe/subscription-preview",
      { planId, addonIds: [], billing: "monthly", storageAddonId: null },
      tags
    );
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "stripe preview 2xx": (r) => r.status >= 200 && r.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
    sleep(jitter());
    return;
  }

  if (flags.includeUploadSessionCreate && testDrive && Math.random() < 0.02) {
    const tags = buildTags("storage", "upload_create", "normal", "yes");
    const res = postJson(
      "/api/uploads/create",
      {
        drive_id: testDrive,
        relative_path: `k6-session/${__VU}-${__ITER}.bin`,
        content_type: "application/octet-stream",
        size_bytes: 1024,
        file_name: "k6.bin",
      },
      tags
    );
    const bad = recordIf5xx(res.status);
    check(res, { "upload create responded": (r) => r.status >= 200 && r.status < 500 });
    if (!bad && res.status >= 200 && res.status < 300) bizziExpectedSuccess.add(1);
    sleep(jitter());
    return;
  }

  if (Math.random() < 0.45) {
    const tags = buildTags("storage", "upload_url_validate", "normal", "no");
    const res = postJson("/api/backup/upload-url", { validate_only: true }, tags);
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "validate 2xx": (r) => r.status >= 200 && r.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
  } else {
    const tags = buildTags("storage", "storage_status", "normal", "no");
    const res = http.get(`${b}/api/storage/status`, { headers: h, tags });
    const bad = recordIf5xx(res.status);
    const ok = check(res, { "storage status 2xx": (r) => r.status >= 200 && r.status < 300 });
    if (!bad && ok) bizziExpectedSuccess.add(1);
  }

  sleep(jitter());
}
