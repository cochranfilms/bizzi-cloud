# Personal vs Enterprise Storage – Deployment Commands

Use these commands to deploy the personal/enterprise storage separation.

## 1. Deploy Firestore Indexes

Indexes must be deployed **before** running the migration (queries that filter by `organization_id` need them).

```bash
# From project root
firebase deploy --only firestore:indexes
```

Index build can take several minutes. Check status:

```bash
firebase firestore:indexes
```

Or in [Firebase Console](https://console.firebase.google.com) → Firestore → Indexes.

## 2. Run the Migration Script

Sets `organization_id: null` on existing `linked_drives` and `backup_files` that don’t have the field.

**Prerequisites:**
- `FIREBASE_SERVICE_ACCOUNT_JSON` set (full JSON from Firebase Console → Project Settings → Service Accounts → Generate new private key)

```bash
# Option A: With env var
export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-organization-id.ts

# Option B: With .env file (if you use dotenv)
# Ensure FIREBASE_SERVICE_ACCOUNT_JSON is in .env.local or .env
npx ts-node --compiler-options '{"module":"CommonJS"}' -r dotenv/config scripts/migrate-organization-id.ts
```

**Note:** If `ts-node` fails, try:

```bash
npx tsx scripts/migrate-organization-id.ts
```

## 3. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

## 4. Deploy the App

```bash
# If using Vercel
vercel --prod

# Or build locally
npm run build
```

## Order of Operations

1. Deploy indexes (and wait for them to build)
2. Run migration script
3. Deploy Firestore rules
4. Deploy the app

## Verification

- **Personal dashboard** (`/dashboard`): Only personal drives and files
- **Enterprise dashboard** (`/enterprise`): Only enterprise drives and files
- **Trash**: Personal trash at `/dashboard/trash`, enterprise trash at `/enterprise/trash`
- **Storage quota**: Personal vs enterprise quotas applied per context
