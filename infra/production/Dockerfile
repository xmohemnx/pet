# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm install --frozen-lockfile
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm build && pnpm --filter @petra/api deploy --prod --legacy /api-runtime && \
    mkdir -p /api-runtime/infra /api-runtime/scripts /web-runtime && \
    cp -a infra/database /api-runtime/infra/ && \
    cp scripts/production-migrate.mjs scripts/production-readiness.mjs scripts/production-check.mjs scripts/backfill-hls.mjs /api-runtime/scripts/ && \
    cp -a apps/web/.next/standalone/. /web-runtime/ && \
    cp -a apps/web/.next/static /web-runtime/apps/web/.next/static && \
    cp -a apps/web/public /web-runtime/apps/web/public

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS api
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4000 PETRA_DEMO_MODE=false
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /api-runtime /app
USER node
EXPOSE 4000
CMD ["node", "--use-env-proxy", "dist/apps/api/src/main.js"]

FROM api AS worker
CMD ["node", "--input-type=module", "-e", "import {runWorker} from './dist/apps/api/src/operations/worker.js'; await runWorker();"]

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /web-runtime ./
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
