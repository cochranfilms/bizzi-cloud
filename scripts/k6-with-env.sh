#!/usr/bin/env bash
# Load k6/.env.local into the environment, then run k6 with the remaining args.
# Usage (from repo root): ./scripts/k6-with-env.sh run -e K6_PROFILE=smoke k6/notifications-load.js
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/k6/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  echo "Copy k6/.env.local.example to k6/.env.local and set BASE_URL and BEARER_TOKEN." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
exec k6 "$@"
