# syntax=docker/dockerfile:1
#
# FluxIQ Core: the panel, its API and the client gateway in one image.
#
#   docker build -f deploy/docker/Dockerfile -t fluxiq-core .   (from the repository root)
#
# One image serves all three profiles. FLUXIQ_PROFILE (local, self-hosted or
# service), the public origin, the gateway's Origin allowlist and every secret
# are runtime settings, never build arguments, so nothing private is baked in.
# docs/operations/self-hosting.md is the operator's guide.
#
# Release builds pin NODE_IMAGE to a digest (node:22-bookworm-slim@sha256:...),
# as the hosted production plan's supply-chain row requires; the default tag is
# for local builds. Both stages use the same image, so the native sqlite3 the
# build stage compiles or downloads matches the runtime's libc and architecture.

ARG NODE_IMAGE=node:22-bookworm-slim
ARG PNPM_VERSION=9.15.0

# --- build: the whole workspace, built as CI builds it ----------------------
FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION

# sqlite3 falls back to node-gyp when no prebuilt Linux binary matches.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global "pnpm@${PNPM_VERSION}"

ENV CI=true \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Manifests first, so the install layer survives edits to source.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/web/package.json ./apps/web/
COPY packages/client-gateway-websocket/package.json ./packages/client-gateway-websocket/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/fluxiq/package.json ./packages/fluxiq/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/ui-components/package.json ./packages/ui-components/
RUN pnpm install --frozen-lockfile

COPY . .

# The root build: Core's libraries to their stamped dist, then the panel
# (the client gateway bundle, `next build`, and the runtime identity check that
# refuses a panel compiled from Core's source). FLUXIQ_WEB_STANDALONE=1 makes
# next.config.ts add `output: "standalone"`. The image has no git, so the build
# cache runs every step uncached (scripts/build-cache/run-step.mjs).
ENV FLUXIQ_WEB_STANDALONE=1
RUN pnpm build

# The client gateway bundle is loaded by a native import at runtime and keeps
# `fluxiq` external (apps/web/scripts/build-client-gateway-server.mjs), so
# Next's file tracing never sees what it imports. A production deploy of the
# fluxiq package (its dist and its runtime dependencies, sqlite3 included)
# serves it; the runtime stage keeps it at this same absolute path, so the
# symlinks pnpm wrote inside it stay valid, and links it beside the bundle.
# Selected by path: the repository root is also named "fluxiq".
RUN pnpm --filter ./packages/fluxiq deploy --prod /opt/fluxiq-gateway-runtime

# --- runtime: the standalone server, non-root, writable only at /data -------
FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    FLUXIQ_PROFILE=self-hosted \
    FLUXIQ_ROOT=/data \
    FLUXIQ_CLIENT_GATEWAY_HOST=0.0.0.0 \
    FLUXIQ_CLIENT_GATEWAY_PORT=4777 \
    FLUXIQ_GATEWAY_SERVER_MODULE=/app/apps/web/.server-runtime/client-gateway-server.mjs

# FLUXIQ_PROFILE defaults to self-hosted, not local: local starts with the
# loopback admin account and no setup code, which a container reachable from a
# network must never do. self-hosted refuses to start without
# FLUXIQ_PUBLIC_ORIGIN, and a gateway bound beyond loopback refuses to start
# without FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS, so a forgotten setting fails
# closed (never ready) instead of opening it. HOSTNAME is Next's bind address; the
# gateway binds every interface so a reverse proxy on the container network
# reaches it. Neither port is meant to be published to the internet directly.

WORKDIR /app
# Application files stay owned by root: the runtime user can read, not write.
COPY --from=build /app/apps/web/.next/standalone/ ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/.server-runtime ./apps/web/.server-runtime
COPY --from=build /opt/fluxiq-gateway-runtime /opt/fluxiq-gateway-runtime
COPY deploy/docker/healthcheck.mjs ./deploy/healthcheck.mjs
# The gateway bundle's `import "fluxiq/server"` resolves through this link;
# Node follows it to the deploy, whose own node_modules then serve fluxiq's
# dependencies. The same deploy holds the operator command line
# (/opt/fluxiq-gateway-runtime/dist/platform/provisioning/cli/main.js).
RUN mkdir -p ./apps/web/.server-runtime/node_modules \
  && ln -s /opt/fluxiq-gateway-runtime ./apps/web/.server-runtime/node_modules/fluxiq

# /data holds .fluxiq (accounts, workspaces, the generated setup code). It is
# the only path the runtime user may write; run the container with a
# read-only root (`--read-only`, or `read_only: true` in Compose) and tmpfs
# mounts at /tmp and at Next's cache directory, created here as the mount point.
RUN mkdir -p /data /app/apps/web/.next/cache && chown node:node /data && chmod 0700 /data
VOLUME ["/data"]
USER node

# 3000: panel and API. 4777: client gateway (the proxy routes /client to it).
# The provisioning listener (service profile only) is deliberately not
# exposed: it binds a private network address of the operator's choosing.
EXPOSE 3000 4777

# Liveness only; /api/ready says whether the runtime and gateway are up.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ["node", "/app/deploy/healthcheck.mjs", "/api/health"]

CMD ["node", "apps/web/server.js"]
