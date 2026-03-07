#!/usr/bin/env node
/**
 * Configure CORS on the Backblaze B2 bucket for browser uploads.
 * Run: npm run b2:cors (loads .env.local if present)
 * Or: node --env-file=.env.local scripts/set-b2-cors.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

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
  B2_ENDPOINT,
  B2_REGION = "us-east-005",
} = process.env;

if (!B2_ACCESS_KEY_ID || !B2_SECRET_ACCESS_KEY || !B2_BUCKET_NAME || !B2_ENDPOINT) {
  console.error("Missing env: B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY, B2_BUCKET_NAME, B2_ENDPOINT");
  process.exit(1);
}

const client = new S3Client({
  endpoint: B2_ENDPOINT,
  region: B2_REGION,
  credentials: {
    accessKeyId: B2_ACCESS_KEY_ID,
    secretAccessKey: B2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const corsConfig = {
  CORSRules: [
    {
      AllowedOrigins: [
        "https://www.bizzicloud.io",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ],
      AllowedMethods: ["PUT", "GET", "HEAD"],
      AllowedHeaders: ["*"],
      MaxAgeSeconds: 3600,
    },
  ],
};

try {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: B2_BUCKET_NAME,
      CORSConfiguration: corsConfig,
    })
  );
  console.log("CORS configured successfully on bucket:", B2_BUCKET_NAME);
  console.log("Allowed origins: www.bizzicloud.io, localhost:3000");
  console.log("For preview deployments, add https://<preview>.vercel.app to the script and run again.");
} catch (err) {
  console.error("Failed to set CORS:", err.message);
  process.exit(1);
}
