#!/usr/bin/env bash
#
# Refresh the vendored copy of the backend's OpenAPI contract.
#
# Run this by hand (or ask an agent to) when the backend contract changes, then
# `pnpm api:gen` and commit both the schema and the regenerated client.
#
# CI must NOT run this. The vendored file is the single source for codegen, so
# generation stays offline, deterministic and reviewable — and staging is spun
# down between uses (`just staging-down`), which would make a live-fetch gate
# red for reasons unrelated to the change under review. Drift against the
# backend is detected by a scheduled job that opens a PR, not by a gate.
#
# No credentials needed: the schema is served publicly at /schema/v1/.
set -euo pipefail

SCHEMA_URL="${SCHEMA_URL:-http://localhost:8000/schema/v1/}"
HEALTH_URL="${SCHEMA_URL%/schema/*}/health/data/"
OUT="$(dirname "$0")/../schema/openapi.yaml"
SOURCE="$(dirname "$0")/../schema/SOURCE.md"

echo "Pulling $SCHEMA_URL"
curl -fsSL "$SCHEMA_URL" -o "$OUT"

# data_version is the backend's own content hash, not a code SHA — it is the
# most useful thing to record for "which backend was this generated against".
data_version="$(curl -fsS "$HEALTH_URL" 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data_version","unknown"))' \
  2>/dev/null || echo unknown)"

cat > "$SOURCE" <<EOF
# Vendored API contract

Do not edit \`openapi.yaml\` by hand — it is a copy of the backend's published
contract. Refresh it with \`pnpm api:pull\`, then \`pnpm api:gen\`, and commit
both together.

| | |
|---|---|
| Source | \`$SCHEMA_URL\` |
| Pulled | $(date -u +"%Y-%m-%d %H:%MZ") |
| Backend \`data_version\` | \`$data_version\` |

The backend enforces this file's accuracy on its own side: \`openapi.yaml\` is a
committed artifact there, CI fails on drift, and every response on
\`/stock-items/\`, \`/inventory-kits/\`, \`/inventory-transfers/\` and
\`/api/v1/web/\` is validated against it on every test run. Operations outside
those paths are documented but unverified — which is why \`orval.config.ts\`
generates from an explicit allowlist rather than the whole document.
EOF

echo "Wrote $OUT and $SOURCE (data_version: $data_version)"
