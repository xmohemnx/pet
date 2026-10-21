#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export XDG_DATA_HOME=/workspace/.cache/data
export XDG_CACHE_HOME=/workspace/.cache/cache
export XDG_STATE_HOME=/workspace/.cache/state
export npm_config_cache=/workspace/.cache/npm
export NEXT_TELEMETRY_DISABLED=1
node -e 'if(process.versions.node.split(".")[0]!=="24")throw new Error("Node.js 24 required")'
test "$(pnpm --version)" = 11.25.0
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
pnpm install --frozen-lockfile
git config core.hooksPath .githooks
node scripts/prepare-env.mjs
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm test:db
pnpm check
pnpm build
pnpm security:built
