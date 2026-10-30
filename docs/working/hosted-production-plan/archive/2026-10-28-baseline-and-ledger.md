# Hosted Production Plan: baseline and early ledger (archive)

Status: Archived
Status detail: Moved out of the hosted production plan on 2026-10-28 when it was compacted; the baseline carries H0's corrections inline, the ledger entries are verbatim.
Created: 2026-10-28
Last updated: 2026-10-28
Owner: Senior supervisor agent
Scope: Reference only: the pre-hosted system baseline and the first three ledger entries of Core's hosted production plan.
Paired document: none
Related: [hosted production plan](../../hosted-production-plan.md)

---

## Current System Baseline

Paths are relative to this repository unless prefixed `ext:`. Read 2026-10-17, re-checked 2026-10-28.

- **Panel.** Next.js 15.5.24 App Router in `apps/web`, `next start --hostname 127.0.0.1` on
  port 3000; same-origin fetches and polling. Login is `app/AuthShell.tsx`; pages check the
  session on the server (`lib/auth.ts`). "FluxIQ" is hard-coded in `app/layout.tsx` and
  `AuthShell.tsx`; the catalog is `GLOBAL_PROGRAMS` (`programs/_shared/catalog.ts`).
- **Gateway.** A hand-written WebSocket server (`apps/web/src/server/client-gateway-websocket.ts`)
  on port 4777 `/client`, started in-process by `startSharedClientGateway` (`lib/fluxiq.ts`).
  Beyond loopback it needs `FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS`; an empty list admits every
  Origin. `publicUrl` is always `ws://`. Unbounded frames, session records, audit log and pending
  pairings. H0-S2 measured: a 20 MiB frame is accepted, a silent socket stays open, Origin
  matching is exact-string (no `moz-extension://*`), a missing Origin is refused when an allowlist
  is set, and the gateway never reads the peer address or `X-Forwarded-For`.
- **Identity** (`programs/identity-access/runtime/`). Roles are flat permission lists
  (`roles.ts`): `admin` has all eight (`programs.read`, `programs.write`, `flows.write`,
  `runtime.control`, `compute.control`, `identity.manage`, `data.manage`, `secrets.manage`);
  `viewer` has `programs.read`. scrypt, TOTP, PIN; 12-hour sessions stored as SHA-256;
  admin/admin at first start (`service.ts:728-738`); 100 failures lock everyone out for a minute
  (`api/auth/login/route.ts:17`). Cookie `fluxiq_session`, Secure only in production; no CSRF or
  Origin check, no CORS, no `middleware.ts`.
- **Authorization today.** One choke point, `GlobalProgramApiRegistry.call`
  (`programs/_shared/api.ts:97-120`), checks `actor.permissions.includes(registration.permission)`.
  289 endpoint registrations each declare one `permission` (`programs.read` 124, `flows.write`
  59, `runtime.control` 45, `programs.write` 30, `identity.manage` 11, `data.manage` 8,
  `compute.control` 7, `secrets.manage` 5) and a `classification` (`read`, `authoring`,
  `destructive`, `program-gated`, `destructive-ungated`); destructive ones also need the PIN.
  `ProgramApiActor` is `{sessionId, userId, roleId, permissions}`: no resource is named. 15 app
  routes under `apps/web/src/app/api`; 9 check `auth.role.permissions` themselves.
- **Pairing.** Six-digit `Math.random` code; any `runtime.control` user approves; a 32-byte
  token stored hashed in `client-gateway/trusted-clients`, 30-day expiry, rotating without
  extension. Bearer HTTP only while the socket is ready, on an allowlist (`service/access.ts`).
- **Single-tenant assumptions.** One FluxIQ instance per process on `globalThis`. Projects,
  Flows, recordings, runs and datasets have no owner (`automation-studio/api/contracts/project.ts`
  has only `domainId`). Every `runtime.control` user sees every session. `selectSession`
  (`runtime/client-gateway-transport.ts:110-115`) falls back to any ready matching session.
  Process singletons: activity hub, host-lease scope, retry ledger, endpoint load, hash limiter,
  `automationStudioContexts`; H0-S4 adds the gateway-trace and offline-trial `installed` slots, the
  login `trackers` map and the `FLUXIQ_PUBLIC_CLIENT_WS_URL` write, and finds
  `getFluxIQWebRuntimeStatus` returning `hostRoot` and `fluxiqDir`.
- **Storage.** Node `sqlite3`: `global.sqlite`, per-domain and per-project databases (26
  forward-only migrations). SQLite-specific SQL; in-process locks. `Repository<T>` is the only
  backend-neutral interface.
- **Secrets.** AES-256-GCM sealed under the creator's password-derived key; unlocks held per
  login session (`held-keys.ts`). `releaseAutomationStudioSessionDeepSeekKey`
  (`runtime/llm/deepseek/session-key.ts:33-43`) takes the newest enabled DeepSeek key of anyone; release then refuses a key that is not the
  caller's (a denial, not a disclosure; H0-S5).
- **Model spend.** DeepSeek only; per-run ceiling $0.25 (max $10), per-Flow purse, 250-call backstop.
- **Retention and export.** Projects and recordings deletable; runs not. The retention store
  is unused. Only datasets and run audits export.
- **Domain hooks.** Synchronous `registerFluxIQHost(fluxiq)` from `FLUXIQ_HOST_MODULE`, per
  instance. `componentPacks` and `programExtensions` unused (`domains/index.ts:53-54`).
- **Operator-only surfaces.** Deployment Sync, Database Manager, root Docs, Status paths; the
  "check nothing" endpoints in `package-boundaries.md`.
- **Hosting.** No Dockerfile, TLS or proxy support. Licence: Sustainable Use License.

## Work Ledger

### 2026-10-17 — Hosted production plan written
- Agent: lane lead hosted-production-planner
- Changed: created this document and the paired downstream document; no code, config or index edited
- Why: the user asked for a production plan (hosted service on their domain, login and connect via the website, panel customisation in the framework), with self-hosting kept first-class
- Validation: `node scripts/structure-audit.mjs` (Core) -> "1 violation(s) across 1 rule(s)": `[working-docs] docs/working/README.md is out of date`. The index row is left to the supervisor; no header, size or link findings for this document. Baseline re-read in `apps/web/package.json`, `client-gateway-websocket.ts:27-45`, `client-gateway-transport.ts:98-107`, `session-key.ts:33-43`, `project.ts:6-15`, `domains/index.ts:53-54`, `login/route.ts:116-122`
- Outcome: Partial
- Follow-up: the user answers the Open Questions; the supervisor adds the index row and dispatches P0

### 2026-10-18 — Revised with the user's decisions
- Agent: lane lead hosted-production-planner
- Changed: this document (Current State, topology, identity, new provisioning and authorization sections, keys, security, testing, phases, questions); the paired document in step
- Why: the user decided that hosted ships with the Chrome release on getfluxiq.com, that the website's backend provisions accounts through a Core API, that keys are bring-your-own only, and that billing stays a port
- Validation: `node scripts/structure-audit.mjs` (Core) -> "1 violation(s) across 1 rule(s)": only `docs/working/README.md is out of date` (the index row, left to the supervisor). The document is 751 lines, with a 73-line Current State. Re-read `programs/secret-keys/runtime/held-keys.ts:12-88` (unlocks keyed by session) and `api/handlers/conversations.ts:200-278` (callers pass `sessionId`)
- Outcome: Partial
- Follow-up: dispatch H0; the user answers N1 to N4

### 2026-10-28 — Revised around the user's 2026-10-18 directions
- Agent: supervisor; plan revision by a worker-heavy (brief H1), notes `!FluxIQWebExtension/docs/working/hosted-production-plan/reports/revision-2026-10-28-notes.md`
- Changed: FluxIQWebsite (Next.js 16 static export on Hostinger) is the public site at getfluxiq.com and gains sign-up and its backend; Core moves to app.getfluxiq.com behind a private provisioning listener; `apps/site` shrinks to `apps/product`; a local website stand-in (`packages/website-stand-in/`, W0-W4) comes first; permissions follow AWS IAM (FRNs, generated actions, policies with explicit deny, predefined `FluxIQUserAccess`/`FluxIQOwnerFullAccess`, an inert-for-local parity test); the schedule is re-cut into parallel lanes (hosted gate 11-11/12, store submission about 11-13, each date's constraint named). The "Next revision owed" block is removed.
- Validation: the worker checked the cited Core facts in code (no `platform/` or provisioning yet; one permission check in `_shared/api.ts`; 289 permission declarations); `node scripts/structure-audit.mjs` after the swap (below).
- Outcome: plan revised; D0 and Core H0 can start. Open for the user: N2 (two hostnames), N5, N6, U9 (VM, DNS, store developer account), U10 (Google Analytics vs decline-by-default), U11 (go-ahead to edit FluxIQWebsite).

## Ledger entries moved 2026-10-29

### 2026-10-17 to 10-28 — Plan written, revised with the user's decisions, revised around FluxIQWebsite
- Agent: lane lead hosted-production-planner; supervisor and a worker-heavy for the 10-28 revision (notes `!FluxIQWebExtension/docs/working/hosted-production-plan/reports/revision-2026-10-28-notes.md`)
- Changed: created this document and the paired one; revised both on 10-18 (hosted with the Chrome release, provisioning API, bring-your-own-key, billing a port) and 10-28 (FluxIQWebsite is the public site, Core on app.getfluxiq.com behind a private provisioning listener, `apps/site` shrinks to `apps/product`, local website stand-in, AWS-IAM-style permissions with an inert-for-local parity test, parallel lanes, store submission about 11-13); no code, config or index edited
- Validation: `node scripts/structure-audit.mjs` (Core), 10-17 and 10-18 -> "1 violation(s) across 1 rule(s)": only `[working-docs] docs/working/README.md is out of date` (index row left to the supervisor), no header, size or link findings; on 10-18 the document was 751 lines with a 73-line Current State. The 10-28 worker checked the cited Core facts in code (no `platform/` or provisioning yet; one permission check in `_shared/api.ts`; 289 permission declarations); its post-swap audit result was not recorded. Baseline re-read in `apps/web/package.json`, `client-gateway-websocket.ts:27-45`, `client-gateway-transport.ts:98-107`, `session-key.ts:33-43`, `project.ts:6-15`, `domains/index.ts:53-54`, `login/route.ts:116-122`, `held-keys.ts:12-88`, `conversations.ts:200-278`
- Outcome: Partial (10-17, 10-18); revised, H0 startable (10-28)
- Follow-up: the user's answers to the Open Questions; H0 (done below)

### 2026-10-28 — H0 spikes folded in
- Agent: supervisor; spikes by sub-supervisor t782 (S5 on Opus, the rest on Sonnet); this fold drafted by a worker (brief H0-fold)
- Changed: this document: Current State; Audit of every decision; credential and gateway 0.2 fields; Gateway Transport (Origin rule, limits, client IP); Tenancy (workspace manager, `close()`, singletons); Model Calls (selection fix, unlock); Security rows 9 and 10; Testing; Phases (lanes A, B1, B2, C with new C0, D; optional lane P; totals); Risks; N7; baseline and old ledger moved to the archive
- Validation: the sub-supervisor's re-runs, from `reports/h0.md`: S2 `node run.mjs list` -> two 101 upgrades to `server.pairing_required`, 403 for refused Origins and a direct evil Origin; S3 `node --expose-gc retain.mjs` -> `"alive":[true,true,true,true]` after close and gc; S5 `npx vitest run --dir ../../spikes/h0-s5` from `packages/fluxiq` -> 3 of 3 passed; S6 `bench-filter.cjs` and `volume.cjs` -> volume figures match, per-item SQLite rows 32 to 46 µs. S1 outputs read (3 accepted, 3 rejected per browser, boot ids change); S4 tables read, rg counts not re-run. This fold: not validated by command (plan text only); the supervisor runs `node scripts/structure-audit.mjs` after the swap
- Outcome: Partial (S2 ran through a Node TLS stand-in; Caddy is not installed)
- Follow-up: contract freeze with the H0 changes; C0; the user's answer on N7

