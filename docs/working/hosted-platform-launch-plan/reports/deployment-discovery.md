# Deployment Discovery

## Findings

- **Core release/deploy:** one Docker image from `deploy/docker/Dockerfile`, Node 22 base (release must pin `NODE_IMAGE` by digest; pnpm 9.15), `pnpm build`, Next standalone panel plus production `fluxiq` deployment at `/opt/fluxiq-gateway-runtime`. Runtime is non-root; `/data` alone is writable; app ports 3000/4777 are internal behind Caddy, provisioning 4780 is service-only/private. See `docs/operations/self-hosting.md`, `deploy/docker/Dockerfile`, and `deploy/compose/{self-hosted,service}.compose.yml`.
- **Commands/dependencies:** local image: `docker build -f deploy/docker/Dockerfile -t fluxiq-core:local .`; hosted profile smoke: `bash deploy/docker/smoke.sh fluxiq-core:local self-hosted` and `bash deploy/docker/smoke.sh fluxiq-core:local service`. Smoke requires Docker, curl, jq, openssl and generates/removes run-local secrets. Compose starts via `docker compose -f deploy/compose/{self-hosted,service}.compose.yml up -d --build`; operator settings and secret files are in `deploy/env/*.env.example` and `deploy/secrets/`. `.dockerignore` excludes local env, secrets, `.fluxiq`, worktrees, and builds.
- **CI gap / live deployment:** `.github/workflows/deploy.yml` is manual-only and builds/smokes both profiles. Its deploy job is gated off unless `FLUXIQ_DEPLOY_ENABLED=true`, and currently contains no target/credentials. Deployment account/provider configuration is therefore an external rollout gate, not a code prerequisite. Docker and Podman executables were not found in this worker environment, so no image build or smoke could run.
- **Profile semantics:** pure resolver `packages/fluxiq/src/platform/profile/resolve/resolve-profile.ts` defaults missing/blank `FLUXIQ_PROFILE` to `local` and rejects unknown values. `deployment-settings.ts` requires an origin for self-hosted/service and HTTPS for service; service is public even on loopback, self-hosted only when bound beyond loopback. Image runtime defaults profile to `self-hosted`, binds gateway at `0.0.0.0`, roots state at `/data`, and fails closed if public origin or public-bind Origin allowlist is absent. Compose fixes profile, root and proxy trust; local defaults remain independent.
- **Downstream product/browser packaging:** `apps/product/src/manifest/product-manifest.ts` is a product/branding/auth/links manifest validated against Core's `panelProductSchema`; it is not a release manifest. Chrome and Firefox extension manifests both currently advertise version `0.1.0`; browser-specific permissions and popup/side-panel differ. Root downstream scripts include `fluxiq:host:build` and `fluxiq:setup`, but there is no hosted deployment artifact/manifest coupling the browser package to a Core release. `apps/extension/src/shared/build-identity` stamps the extension artifact for internal build identity, distinct from a compatibility contract.

## Existing compatibility seams

1. Core's `packages/fluxiq/src/runtime/build-identity` embeds package version plus hashes of built `contracts`/`fluxiq` JS artifacts (`artifactDigest`, per-file hashes). `scripts/runtime-build-identity/build.mjs` generates it; `scripts/web-build/identity/assert-stamped-identity.mjs` prevents a panel build from using unstamped Core source. This is build provenance/freshness, not a supported-client compatibility decision.
2. `packages/contracts/src/platform/discovery/discovery-document.ts` already defines discovery v1 with `protocols.clientGateway` and `minimumClient`; `apps/web/src/app/api/discovery/build-discovery-document.ts` publishes gateway versions `0.1`/`0.2` and minimum browser extension `0.1.0`. This is the public, additive compatibility seam, parsed by downstream extension discovery logic.
3. Gateway compatibility itself is tested by `packages/fluxiq/src/client-gateway/service/tests/protocol-version.test.ts`; it accepts same-major protocol versions and refuses incompatible majors. The current `apps/product` and browser manifests lack runtime/API compatibility declarations.

## Recommended small, testable first unit

Extend the existing **Core discovery contract** as the release compatibility manifest rather than inventing a second version source: add an optional, additive `runtime`/`release` object carrying Core package version and the already-built `artifactDigest`/identity protocol; produce it from `readCoreRuntimeBuildIdentity()` in `build-discovery-document.ts`; validate it in the contracts schema; add owner-local contract and builder tests. Keep compatibility decisions based on explicit protocol versions and `minimumClient` (and reject malformed/unsupported major versions), not on ordering experiment branch package versions. This makes local, service, and experimental builds report their own immutable artifact identity while preserving the current protocol gate and allowing an experiment to declare a distinct incompatible protocol until explicitly accepted.

Acceptance tests should cover: local/self-hosted/service all publish valid version data; missing/placeholder runtime identity fails closed or is explicitly represented as unavailable rather than faked; known compatible gateway protocol versions pass; unknown major / malformed manifest is refused; older extension below `minimumClient` is refused; adding a future optional field remains forward-compatible. Tests belong beside Core discovery schema and web discovery builder (`packages/contracts/src/platform/discovery/tests/` and `apps/web/src/app/api/discovery/tests/`), with no browser/build changes required for this first contract unit. A later paired downstream unit can consume the new field and compare its embedded extension identity against the instance's declared compatibility.

## Suggested file ownership for that first unit

- Core contracts: `packages/contracts/src/platform/discovery/discovery-document.ts` and its `tests/discovery-document.test.ts`.
- Core server: `apps/web/src/app/api/discovery/build-discovery-document.ts` plus a colocated tests directory (or existing owner-local test file if present).
- Runtime identity import/guard only if needed: `packages/fluxiq/src/runtime/build-identity/{index,read,types}.ts` and tests; avoid touching Docker or deployment profiles.
- Paired downstream remains untouched for the first unit; later client consumption belongs in extension discovery/compatibility code and its adjacent tests, not product branding manifest or browser manifests.

## Validation commands (not run)

- Core contract/schema: focused Vitest tests for `packages/contracts/src/platform/discovery/tests/discovery-document.test.ts` (exact filter syntax should be chosen when implementing); Core/web focused tests via the package test command with the new test path.
- Narrow owner checks: `pnpm --filter @fluxiq/contracts check` and `pnpm --filter @fluxiq/web check`.
- Deploy integration after Docker is available: `docker build -f deploy/docker/Dockerfile -t fluxiq-core:local .`; then both `bash deploy/docker/smoke.sh ...` commands above.

Outcome: Done
Changed: `docs/working/hosted-platform-launch-plan/reports/deployment-discovery.md`
Validation: read-only source inspection -> deployment/profile/compatibility seams recorded; Docker/Podman commands unavailable; no build or smoke run (brief prohibits builds/servers/cloud calls).
Not verified: Docker image build, hosted profile smoke tests, and exact filtered test CLI behavior.
Report: `docs/working/hosted-platform-launch-plan/reports/deployment-discovery.md`
Notes: No source, shared plan, or git state changed. No secrets were read or emitted.
