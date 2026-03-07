#!/usr/bin/env node
/**
 * Configure CORS on the Backblaze B2 bucket for browser uploads.
 * Uses B2 Native API (required when bucket has existing native CORS rules).
 * Run: npm run b2:cors (loads .env.local if present)
 * Or: node --env-file=.env.local scripts/set-b2-cors.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const {
  B2_ACCESS_KEY_ID,
  B2_SECRET_ACCESS_KEY,
  B2_BUCKET_NAME,
} = process.env;

if (!B2_ACCESS_KEY_ID || !B2_SECRET_ACCESS_KEY || !B2_BUCKET_NAME) {
  console.error("Missing env: B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY, B2_BUCKET_NAME");
  process.exit(1);
}

const ALLOWED_ORIGINS = [
  "https://www.bizzicloud.io",
  "https://bizzicloud.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

// B2 Native API CORS rules. S3 ops: s3_put, s3_get, s3_head (from existing bucket rules)
const corsRules = [
  {
    corsRuleName: "bizzi-cloud-s3-uploads",
    allowedOrigins: ALLOWED_ORIGINS,
    allowedHeaders: ["*"],
    allowedOperations: ["s3_put", "s3_get", "s3_head"],
    maxAgeSeconds: 3600,
  },
  {
    corsRuleName: "bizzi-cloud-b2-downloads",
    allowedOrigins: ALLOWED_ORIGINS,
    allowedHeaders: ["authorization", "range"],
    allowedOperations: ["b2_download_file_by_id", "b2_download_file_by_name"],
    maxAgeSeconds: 3600,
  },
];

async function main() {
  // 1. Authorize
  const auth = Buffer.from(`${B2_ACCESS_KEY_ID}:${B2_SECRET_ACCESS_KEY}`).toString("base64");
  const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!authRes.ok) {
    const err = await authRes.text();
    throw new Error(`b2_authorize_account failed: ${authRes.status} ${err}`);
  }
  const authData = await authRes.json();
  const { authorizationToken, apiUrl, accountId } = authData;

  // 2. Get bucket ID
  const listRes = await fetch(`${apiUrl}/b2api/v2/b2_list_buckets`, {
    method: "POST",
    headers: {
      Authorization: authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accountId, bucketName: B2_BUCKET_NAME }),
  });
  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`b2_list_buckets failed: ${listRes.status} ${err}`);
  }
  const listData = await listRes.json();
  const bucket = listData.buckets?.[0];
  if (!bucket) {
    throw new Error(`Bucket "${B2_BUCKET_NAME}" not found`);
  }
  const { bucketId } = bucket;

  // 3. Update bucket CORS
  const updateRes = await fetch(`${apiUrl}/b2api/v2/b2_update_bucket`, {
    method: "POST",
    headers: {
      Authorization: authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountId,
      bucketId,
      corsRules,
    }),
  });
  if (!updateRes.ok) {
    const err = await updateRes.text();
    throw new Error(`b2_update_bucket failed: ${updateRes.status} ${err}`);
  }

  console.log("CORS configured successfully on bucket:", B2_BUCKET_NAME);
  console.log("Allowed origins:", ALLOWED_ORIGINS.join(", "));
  console.log("For preview deployments, add https://<preview>.vercel.app to the script and run again.");
}

main().catch((err) => {
  console.error("Failed to set CORS:", err.message);
  process.exit(1);
});
