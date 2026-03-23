#!/usr/bin/env bash
# Configure CORS on Firebase Storage bucket for browser LUT direct uploads.
# Required for files > 4MB — client PUTs to signed URL, CORS must allow app origin.
#
# Prerequisites: gcloud CLI installed and authenticated (gcloud auth login)
#
# Usage:
#   ./scripts/set-firebase-storage-cors.sh
#   FIREBASE_STORAGE_BUCKET=my-bucket ./scripts/set-firebase-storage-cors.sh
#
# Bucket is read from .env.local (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) or defaults to bizzi-cloud.firebasestorage.app.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"

# Prefer explicit env, then .env.local, then default
if [[ -n "${FIREBASE_STORAGE_BUCKET}" ]]; then
  BUCKET="${FIREBASE_STORAGE_BUCKET}"
elif [[ -f "${ENV_FILE}" ]]; then
  BUCKET=$(grep -E "^NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
fi
BUCKET="${BUCKET:-bizzi-cloud.firebasestorage.app}"
CORS_FILE="${SCRIPT_DIR}/firebase-storage-cors.json"

echo "Setting CORS on gs://${BUCKET}..."
gcloud storage buckets update "gs://${BUCKET}" --cors-file="${CORS_FILE}"
echo "Done. CORS allows: https://www.bizzicloud.io, https://bizzicloud.io, localhost, *.vercel.app"
