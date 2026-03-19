/**
 * Set a user's password by email (for testing/admin use).
 * Run with: npm run set-user-password -- philipk@gmail.com philip1234
 *
 * Loads FIREBASE_SERVICE_ACCOUNT_JSON from .env.local.
 */
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function getServiceAccountJson(): string {
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;
  if (pathEnv) {
    const fullPath = path.resolve(process.cwd(), pathEnv);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, "utf8");
    }
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) return json;
  console.error("Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_PATH in .env.local");
  process.exit(1);
}

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];
  if (!email || !newPassword) {
    console.error("Usage: npm run set-user-password -- <email> <new-password>");
    console.error("Example: npm run set-user-password -- philipk@gmail.com philip1234");
    process.exit(1);
  }

  if (!getApps().length) {
    const serviceAccount = getServiceAccountJson();
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  }
  const auth = getAuth();

  try {
    const userRecord = await auth.getUserByEmail(email);
    await auth.updateUser(userRecord.uid, { password: newPassword });
    console.log(`Password updated for ${email}`);
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err
      ? (err as { code?: string }).code
      : undefined;
    const msg = code === "auth/user-not-found"
      ? `No user found with email ${email}`
      : err instanceof Error
        ? err.message
        : "Unknown error";
    console.error(msg);
    process.exit(1);
  }
}

main();
