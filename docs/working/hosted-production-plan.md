# Hosted Production Plan

Status: Active
Status detail: Revised 2026-10-18 with the user's decisions (hosted sign-in built into Core for the Chrome release, getfluxiq.com, provisioned accounts, bring-your-own-key); plan only, no code changed; Phase H0 can start now.
Created: 2026-10-17
Last updated: 2026-10-18
Owner: Lane lead hosted-production-planner (plan); the senior supervisor agent owns execution
Scope: Core side of running FluxIQ in production as one codebase with three deployments (getfluxiq.com, local, self-hosted): identity and account provisioning, per-user authorization on every surface, extension sign-in, gateway transport, tenancy and storage, panel extension points, bring-your-own-key model calls, deployment, security, tests, release cut. Browser, store, product site and Lab work is in the paired document.
Paired document: C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/docs/working/hosted-production-plan.md
Related: [package boundaries](../architecture/package-boundaries.md), [current system](../architecture/current-system.md), [client gateway](../integrations/client-gateway-websocket.md), [data and state](../operations/data-and-state.md), [quality and security](../operations/quality-and-security.md), [ui theme](../architecture/ui-theme.md), [MVP final month](./mvp-final-month-plan.md), [working index](./README.md)

---

## Current State

**What is true now.** This is a plan, revised 2026-10-18 after the user's answers. No code has changed. The baseline comes from a read-only audit on 2026-10-17, and its load-bearing claims were re-checked in the code.

**User decisions** (2026-10-17 and 2026-10-18):
- **Self-hosting stays first-class (binding).** Three deployments on one codebase: the service at getfluxiq.com, a person's own local panel, and a person's own server. The extension connects to any of them and keeps its sign-in per browser. Single-user self-hosting needs none of the multi-user machinery.
- **Hosted is not post-MVP.** The extension ships on the Chrome Web Store, and its users sign in to the web panel and see their Flows as soon as the MVP works well enough. It is built into Core directly, so nothing is recreated later.
- **getfluxiq.com runs on Core as its control panel.** Users sign up on the website, and its backend provisions them into Core through a server-side Core API. Each user can read and write only their own account's data: never another user's, and never admin or database access.
- **Model calls use each user's own provider key.** It is stored securely per user and never visible to other users or to the operator in logs. There is no platform key. Buying credits comes later, so billing stays a port. Responsibility sits in the user agreement.
- **No company exists yet;** this does not block the build.
- **FluxIQ declines optional cookies by default.** This is being implemented separately.

**Recommended architecture.**
- **One image, three profiles** (`FLUXIQ_PROFILE=local|self-hosted|service`).
  - The server runs the panel, API, client gateway, model calls and storage. The browser does all page work through the extension.
  - Under `service`, each workspace is its own FluxIQ root, loaded lazily in one process, under a platform layer: accounts, sessions, workspaces, connected browsers.
  - Local and self-hosted keep today's single root.
- **getfluxiq.com is one deployment on one origin.** The product's public pages and sign-up come from a product plugin. The Core panel, the API and `wss://getfluxiq.com/client` come from the same server.
- **Accounts are provisioned through `platform.provisioning`.**
  - A server-side Core library: create, set or reset the credential, assign a workspace and role, disable, enable, delete, rotate.
  - It is handed only to trusted host code. The sign-up backend calls it in-process.
  - An optional HTTP transport, protected by a token, serves a separate front end. It is off by default.
  - Local and self-hosted use the same functions for the owner claim and for adding users.
  - The provisioner cannot read content or grant operator rights.
- **Authorization on every surface.**
  - Each request resolves to a principal: a session, a browser credential, the provisioner, or the operator. The workspace comes only from that principal.
  - A new `user` role has no identity-management, database or operator programs, and a profile policy hides those programs.
  - Every endpoint is classified, and a route-matrix test fails on any endpoint that is not.
  - The gateway admits a browser only to its own workspace, and a browser executes only its own user's runs.
- **Extension sign-in.** A normal-tab authorization code with PKCE: the extension opens `/connect/authorize`, and the user signs in and approves on the website. The fallback is a typed code. The result is a rotating, revocable credential per browser.
- **Keys.** Bring your own, sealed under the user's password-derived key, so the operator cannot decrypt them at rest. Held unlocked in memory only for that user's sessions, and redacted everywhere. Billing and entitlement are no-op ports.
- **Panel customisation in three layers.** Layer 1 is a product manifest. Layer 2, declarative onboarding and settings, comes later. Layer 3 is build-time plugins: public pages, slots, routes, server hooks. Layers 1 and 3 are needed at launch.
- **Deployment.** One VM with Docker Compose (Caddy, the product image, restic). Staging and production on getfluxiq.com.

**Contract ownership.**
- This document owns: discovery, the connect protocol and the browser credential, client gateway 0.2, the provisioning API, the authorization model, profiles and tenancy, panel extension points, and the billing and entitlement ports.
- The paired document owns: the extension client, manifests and stores, consent and data minimisation, the product site and sign-up backend, hosted infrastructure, user docs, privacy, cookies and legal prerequisites, and Lab coverage.

**Schedule: what fits and what does not.** Today is 2026-10-18; the freeze is 2026-10-29 and the deadline 2026-11-10.
- **Fits before the freeze:**
  - H0 decisions and spikes S1 to S5;
  - the contracts;
  - inert new modules (platform store, provisioning and connect libraries, discovery);
  - hardening that is safe for local use;
  - staging prepared and kept closed.
- **Does not fit before the freeze, and must not merge before 11-10:**
  - tenancy wiring, which sends every route through the workspace manager;
  - connect end to end;
  - the extension's sign-in client;
  - the product site;
  - the hosted gate.

  These are built from now in one paired H1 worktree and merge after the MVP release-candidate tag.
- **Plainly:** the MVP still lands on 11-10. A Chrome release with working hosted sign-in does not fit by 11-10 without risking MVP qualification.
  - The secure hosted slice is about 80 agent-days, about 44 of them in Core.
  - With four lanes beside the MVP, it is built around 11-21 and gated around 11-28.
  - It is submitted to the Chrome Web Store around 12-01, and is public when the store approves, likely in early-to-mid December.
  - Recommended (N1): hold the store submission for that gate, so the first public listing already has sign-in.

**Next.**
1. The supervisor dispatches H0 and opens one paired H1 task (one ID in both repositories, nested worktrees), with briefs from "Phases And Release Cut".
2. The user answers N1 to N4 first.

**Blocked.** Nothing blocks H0 or building H1. H1 merges wait for the MVP release-candidate tag.

**Not verified.**
- Tab-flow observation in Edge and in the Firefox popup (S1).
- Memory per workspace instance (S3).
- How an extension-started build finds an unlocked key session. `held-keys.ts` keys unlocks by panel session (S5).
- Firefox data-collection category names.
- Whether Next.js serves `/.well-known` directly; a rewrite is planned.
- The reported separate cookie store of `launchWebAuthFlow`.

## Current System Baseline

Paths are relative to this repository unless prefixed `ext:`. Everything was read on 2026-10-17.

- **Panel.**
  - Next.js 15 App Router in `apps/web`, run by `next start --hostname 127.0.0.1` on port 3000. It uses same-origin fetches and polling; there is no panel WebSocket.
  - Login is `app/AuthShell.tsx`. Every page checks the session on the server (`lib/auth.ts`).
  - "FluxIQ" is hard-coded in `app/layout.tsx` and `AuthShell.tsx`. The catalog is the fixed `GLOBAL_PROGRAMS` (`packages/fluxiq/src/programs/_shared/catalog.ts`).
- **Gateway.**
  - A hand-written WebSocket server on `node:http` (`apps/web/src/server/client-gateway-websocket.ts`) on port 4777 `/client`. It is started in-process by `startSharedClientGateway` (`apps/web/src/lib/fluxiq.ts`). Its bundle is resolved from `process.cwd()` (`src/server/gateway-runtime/load.ts`).
  - Beyond loopback it throws without a restrictive `FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS`; an empty list admits every Origin.
  - `publicUrl` is always `ws://`, and status prefers it over `FLUXIQ_PUBLIC_CLIENT_WS_URL`.
  - Unbounded: frame size, session records (`service/sessions.ts`, never pruned), the audit log (`service/audit-log.ts`), and pending pairings.
- **Identity** (`programs/identity-access/runtime/service.ts`).
  - Users, roles `admin` and `viewer`, scrypt, TOTP and PIN.
  - Opaque 12-hour cookie sessions, stored as SHA-256 in `identity.users` of `.fluxiq/global.sqlite`.
  - admin/admin is created at first start; only admins create users.
  - 100 failures anywhere lock every user out (`app/api/auth/login/route.ts`). Per-address limits need `FLUXIQ_TRUST_PROXY`.
  - The cookie `fluxiq_session` is httpOnly and SameSite=Lax, Secure only under `NODE_ENV=production`.
  - No CSRF or Origin check, no CORS, no `middleware.ts`.
- **Pairing.**
  - `client.hello` gets `server.pairing_required` with a six-digit `Math.random` code (`client-gateway/service/pairings.ts`). Any `runtime.control` user approves it (`pairing-flow.ts`).
  - The token is 32 random bytes, stored as SHA-256 in the `program.state` row `client-gateway/trusted-clients` (`trusted-clients.ts`). It is bound to the client, the approving user and the domain, and expires after 30 days. It rotates on every connect without extending the expiry.
  - Bearer HTTP is valid only while the socket is ready. Its permissions are cut to programs.read and write, runtime.control and flows.write, on an endpoint allowlist (`service/access.ts`, `apps/web/src/lib/program-route.ts`).
  - Revocation is `revoke-client-trust`.
- **Single-tenant assumptions.**
  - One FluxIQ instance per process, on `globalThis`, with one root and one domain.
  - Projects, Flows, recordings, runs and datasets have no owner (`programs/automation-studio/api/contracts/project.ts`); `domainId` is the only partition.
  - Every `runtime.control` user sees every pairing and session.
  - `selectSession` falls back to any ready matching session, whoever owns it (`packages/fluxiq/src/runtime/client-gateway-transport.ts`).
  - Process singletons: activity hub, host-lease scope, retry ledger, endpoint load, hash limiter, `automationStudioContexts`.
- **Storage.**
  - Node `sqlite3`: `global.sqlite`, `domains/<id>/domain.sqlite`, and per-project `project.sqlite`, which has 26 forward-only migrations.
  - The SQL is SQLite-specific (`on conflict`, FTS5, rtree, `begin immediate`). The file stores are concrete classes, and the locks are in-process.
  - `Repository<T>` (`programs/database-manager/types.ts`) is the only backend-neutral interface.
- **Secrets.**
  - Secret Keys are sealed with AES-256-GCM under the creator's password-derived key (`programs/secret-keys/runtime/value-sealer.ts`).
  - Unlocks are held in memory per login session (`held-keys.ts`). Release takes `{userId, sessionId}`.
  - Selection takes the first enabled key of any user, and ignores the caller and `llmSecretKeyId` (`runtime/llm/deepseek/session-key.ts`).
- **Model spend.** DeepSeek only. A $0.25 per-run ceiling (maximum $10), a per-Flow-creation purse and a 250-call backstop. No per-user metering or billing.
- **Retention and export.**
  - Projects and recordings can be deleted; runs cannot be deleted on their own.
  - `AutomationStudioProjectRetentionStore` is unused.
  - Only datasets and run audits can be exported.
- **Domain hooks.**
  - A synchronous `registerFluxIQHost(fluxiq)` is loaded from `FLUXIQ_HOST_MODULE` and applied per instance.
  - `DomainRegistration.componentPacks` and `programExtensions` are unused (`packages/fluxiq/src/domains/index.ts:53-54`).
  - There are no page, slot, route or branding hooks.
- **Operator-only surfaces.**
  - Deployment Sync runs `git` in the root. Database Manager browses the SQLite files. Docs reads `<root>/docs`. Status returns absolute paths.
  - `package-boundaries.md` lists endpoints that "still check nothing": `run-migration`, `deployment-sync/sync` and `rollback`, `revoke-session`, `lock-vault`.
- **Hosting.**
  - No Dockerfile, TLS or proxy support. CI neither deploys nor runs Playwright.
  - The licence is the Sustainable Use License; hosting by licensees needs a commercial agreement. The licensor identity is not yet final.

## Target Topology

```
 user's browser                                   getfluxiq.com: one container image, one origin
 +------------------------------+  wss /client   +---------------------------------------------+
 | FluxIQ extension             | ------------->  | reverse proxy, TLS  (Caddy; none for local) |
 |  chat, recording, executes   |  https /api     |   /        -> Next.js: product pages, panel |
 |  every page action           | ------------->  |              and API                :3000   |
 +------------------------------+                 |   /client  -> client gateway       :4777    |
 +------------------------------+  https          | platform layer: accounts, provisioning,     |
 | website / panel tab          | ------------->  |   sessions, workspaces, connected browsers  |
 |  (sign-up, sign-in, Flows)   |                 | workspace manager: one FluxIQ instance per  |
 +------------------------------+                 |   active workspace root, lazily loaded      |
                                                  | model calls -> provider, with the user's key|
                                                  +---------------------------------------------+
```

**Decision: one multi-tenant service, isolated by workspace root, on a single host first.**

**Division of work.**
- The server runs the panel and API, the gateway, the platform layer, Flow authoring and runtime logic, every model call, storage and background tasks.
- The extension runs page observation, every page action, recording, the chat, sensitive-field screening and the prompts for lasting acts.
- The server never runs a browser.

**The website and the panel are one deployment** (N2).
- The Core server, running the product image, serves getfluxiq.com.
- Public pages (landing, terms, privacy, sign-up) are layer-3 plugin pages marked `public`. The signed-out `/` renders the product's `public.home` slot.
- Sign-up is the product's server route, which calls `platform.provisioning`.
- Signed-in users get the Core panel: their projects, Flows, runs, datasets and settings.
- A separate front end is supported but not recommended now. It would be another host calling provisioning over HTTP, with the panel on `app.getfluxiq.com`. It means two deployments, a session handoff across origins, and a provisioning endpoint reachable over the network.

| Option | Verdict | Why |
| --- | --- | --- |
| Per-user instances (a container per user, routed by subdomain) | Rejected | A Next.js process per user, cold starts, an orchestrator, a second identity layer, N migrations and backups |
| Shared schema with a tenant column on Postgres | Rejected for now | A rewrite of SQLite-specific SQL and file stores; every missed `where tenant=` leaks |
| Serverless or edge | Rejected | The long-lived gateway socket, in-process state, native `sqlite3` |
| **Workspace-per-root in one process** (chosen) | Recommended | Every single-user invariant still holds inside a workspace; isolation at the storage level; export, delete and backup per directory; local and self-hosted unchanged |

**Profiles.** `FLUXIQ_PROFILE` sets defaults, and each line can be overridden.

| Setting | `local` (today) | `self-hosted` | `service` (getfluxiq.com) |
| --- | --- | --- | --- |
| Public origin | none; `http://127.0.0.1:3000` | `https://fluxiq.example.org` | `https://getfluxiq.com` |
| Gateway advertised | `ws://127.0.0.1:4777/client` | `wss://<origin>/client` | `wss://getfluxiq.com/client` |
| TLS | none | Caddy, automatic certificates | Caddy |
| Tenancy | `single` | `single` (`multi` possible, licence-bound) | `multi` |
| Accounts created by | owner claim | owner claim, then admin; both via `platform.provisioning` | the product's sign-up backend via `platform.provisioning` |
| Roles | `admin`, `viewer` | `admin`, `viewer` | `user` (own workspace); operator by command line |
| Identity providers | password | password; OIDC later | password; Google later (Q5) |
| Email sender | none (operator reset) | optional SMTP | required (verify, reset) |
| Connect flows | tab, typed code, one-click on loopback | tab, typed code | tab, typed code |
| Model key | the user's own, sealed under their password | the user's own | the user's own; no platform key |
| Spend limits | per-Flow purse | per-Flow purse | per-Flow purse; per-user daily limit (H2) |
| Billing | none | none | no-op port until credits are sold |
| Operator programs | on for owner | on for owner | off for tenants; command line only |
| LLM step logs | opt-in | opt-in | off |
| Backups | the user's own | self-hosting guide | managed (paired document) |

**Identical in all three:** the extension and its sign-in, discovery, the gateway protocol, the provisioning functions, the authorization checks, workspace contents and storage, the domain host module, the panel extension points, the build loop and the export format.

**What differs:** the defaults, the tenancy resolver, TLS, who calls provisioning, the roles, which operator programs are available, and operations.

**Single tenancy carries no multi-user machinery:** no workspace registry beyond the one, no layout change, no provisioning transport, no email requirement and no billing. Platform data stays in today's `global.sqlite`.

## Identity And Sessions

**Decision: Core owns identity, by extending identity-access.** A managed IdP is rejected as the default, because it would split self-hosted and hosted code. It can plug in later through the generic OIDC provider.

**Providers port** (`programs/identity-access/runtime/providers/`).
- `password`: the scrypt path, and the only provider at the Chrome release.
- `oidc` (H2): a generic relying party (discovery, PKCE, nonce, state) on a reviewed library such as `openid-client`. Google first; self-hosters can use Keycloak, Authentik or Entra.
- OIDC users have no password to seal keys with. The H2 browser-held unwrap key covers this (see Keys).

**Account record.** It gains `email`, `emailVerifiedAt`, `displayName`, `externalId` (the host application's ID), `identities[]`, `status` (active, disabled, deleted), `createdVia` (owner-claim, admin, provisioning) and `termsVersion`.

**Roles.**
- Single tenancy keeps `admin` and `viewer`.
- `service` adds `user`, the owner of a personal workspace (see Authorization).
- `platform-admin` is the operator, on the command line only. Provisioning can never grant it.

**Verification and recovery.**
- `verify-email`, `request-password-reset` and `reset-password` in identity-access, exposed through `apps/web/src/app/api/auth/`.
- An `EmailSender` port (`none`, `smtp`, `file`), with product templates. A `HumanCheck` port (no-op, or Turnstile).
- Under `service`, a verified email is required before connecting a browser or starting a build.
- A reset leaves keys sealed under the old password unreadable. The user re-enters their provider key, and the reset page says so.

**Owner claim replaces admin/admin.**
- `local`: the first loopback visit creates the owner.
- `self-hosted` and `service`: a one-time setup code is printed to the console at first boot (or read from `FLUXIQ_SETUP_CODE_FILE`), and `/setup` requires it.
- Under `service`, the claimed owner is the operator's `admin` in the platform root, not a tenant.
- Every path ends in `platform.provisioning.createAccount`.

**Sessions.**
- Opaque IDs stored as digests.
- Public profiles use `__Host-fluxiq_session`: Secure, HttpOnly, SameSite=Lax, Path=/. It is strictly necessary, not optional. Core sets no optional cookies; the product's consent default (decline) covers any it adds.
- A 12-hour idle TTL; "keep me signed in" gives 30 days, sliding, under `service`.
- Destructive acts need re-authentication, using the password for `user` accounts, which have no PIN.
- A password change revokes the user's other sessions and offers to revoke browsers.
- The cookie rename touches the Lab's parser (paired document).

**Throttling.**
- Sliding windows per account and per IP; the IP comes from the proxy only with `FLUXIQ_TRUST_PROXY`. Stored in the platform store.
- The global 100-failure lockout is removed, since it lets anyone deny service to everyone. An anomaly alert replaces it.
- The hash limiter becomes configurable.

## Account Provisioning API

Owned here. The schema is `packages/contracts/src/platform/provisioning.ts` (zod); the implementation is `packages/fluxiq/src/platform/provisioning/`.

**Transports.**
- **In-process** (recommended for getfluxiq.com). A `platform.provisioning` capability object is handed only to `registerFluxIQPlatform(platform)` and to layer-3 plugin server entries. Tenant handlers never receive it, and no program endpoint wraps it. The product's sign-up route calls it in the same process.
- **HTTP** (optional, off by default). `POST /api/platform/provisioning/<operation>`, enabled only by `FLUXIQ_PROVISIONING_TOKEN_FILE`.
  - The token is 32 bytes, stored as SHA-256, and two may be active, so rotation needs no downtime.
  - Callers must come from `FLUXIQ_PROVISIONING_ALLOWED_CIDRS` (default: loopback and private ranges). Requests are rate-limited.
  - No cookie and no CORS.
  - For a separate front end or a self-hoster's own site.
- **Operator command line.** `fluxiq accounts <operation>` on the host.

Every operation is idempotent by `requestId` and writes a platform audit event (caller, operation, target, time). Errors are typed: `email_taken`, `weak_password`, `not_found`, `disabled`, `forbidden_role`.

| Operation | Input | Effect |
| --- | --- | --- |
| `createAccount` | `email`, `displayName`, `password?`, `externalId?`, `role`, `workspace: "new" \| workspaceId`, `termsVersion?`, `emailVerified?` | Creates the user. With `"new"`, creates a workspace with the user as owner and fires `workspace.created`, where the product seeds a default project. Returns `{userId, workspaceId}` |
| `setPassword` | `userId`, `password` | Hashed with scrypt at once and never logged; other sessions are revoked |
| `issuePasswordSetupLink` | `userId`, `ttlMs` | A one-time link for the user to set a password in Core, so HTTP callers never handle passwords |
| `sendVerificationEmail`, `markEmailVerified` | `userId` | Email state |
| `assignWorkspace` | `userId`, `workspaceId`, `role` | Under `multi` in H1, the personal workspace only |
| `setRole` | `userId`, `role` | `user` under `service`, `admin` or `viewer` under single tenancy; `platform-admin` is refused |
| `disableAccount`, `enableAccount` | `userId`, `reason` | Disable refuses sign-in, revokes sessions and browsers, and sends `server.revoked` |
| `deleteAccount` | `userId`, `mode: "scheduled" \| "immediate"` | Revokes everything, evicts and deletes the workspace, removes platform rows, and returns a receipt |
| `rotateCredentials` | `userId`, `scope: "sessions" \| "browsers" \| "password" \| "all"` | Revokes; `password` forces a reset link |
| `getAccount` | `userId \| email \| externalId` | `{userId, email, status, role, workspaceIds, createdAt, lastSignInAt}`; never hashes, keys or content |

**The provisioner can never:** read or write workspace content (projects, Flows, recordings, runs, datasets, keys); sign in as a user, or mint sessions or browser credentials; grant `platform-admin`; call program endpoints. The capability object exposes the table above and nothing else.

**Passwords.** In-process, the sign-up handler passes the password once, inside the process. HTTP callers use setup links. Passwords never reach logs, the audit or errors.

**Single-user and self-hosted.**
- The owner claim calls `createAccount({role: "admin", workspace: <the only workspace>})`, and "add user" calls the same function.
- The HTTP transport stays off.
- Under single tenancy, added users share the workspace, as today. Isolation per user is a property of `multi`, and the self-hosting guide says so.

## Authorization On Every Surface

**Principals.**
- `session`: the cookie.
- `browser`: a connected-browser credential, on the socket or as Bearer.
- `provisioner`: in-process host code, or the token.
- `operator`: the command line, as `platform-admin`, with no web surface in H1.

**Resolution.** Each request resolves to `{principal, userId, workspaceId}`, with the workspace taken only from the principal. The handler receives only that workspace's FluxIQ instance and cannot name another.

**`user` role** (`service`).
- Granted:
  - programs.read and write, flows.write;
  - runtime.control, for the user's own browsers only;
  - `secrets.own`: create, rotate and delete their own keys, never reveal;
  - `identity.self`: own password, sessions, browsers, and deletion request.
- Not granted:
  - identity.manage;
  - Database Manager, Deployment Sync, Compute Control, production-runner administration and root Docs;
  - framework setup and migrate;
  - custom nodes.

**Endpoint classification.**
- Every program endpoint and app route declares `scope: "self" | "workspace" | "platform" | "operator"` and its permissions.
- Under public profiles, an unclassified endpoint is refused at startup.
- The route matrix fails on any unclassified endpoint and on any cross-workspace access. This is the mechanical enforcement.

**Program availability policy** (`programs/_shared/`). Under `service`, tenants see Automation Studio, Secret Keys and the packaged Docs reference. Everything else is hidden and refused at the API. Status stops returning `hostRoot` and `fluxiqDir`.

**Gateway.**
- A browser credential carries `{userId, workspaceId, domainId}`, and its hello is admitted only to that workspace's gateway.
- Commands go only to the actor's own browsers (the browser-owner invariant).
- The extension drops any command whose `runContext` user is not its own.
- Bearer HTTP keeps to the allowlist, within the same workspace.

**Audit.** The platform audit records sign-ins, provisioning calls, browser connects and revocations, key changes and deletions. A user can see the entries for their own account.

## Extension Client Sign-In Protocol

Owned here. The paired document owns the browser-side client.

**Discovery.** `GET /.well-known/fluxiq` is rewritten (`next.config.ts`) to `/api/discovery`. Schema: `packages/contracts/src/platform/discovery.ts`. No secrets; cacheable for 5 minutes.

```json
{ "fluxiqDiscoveryVersion": 1,
  "instance": { "name": "FluxIQ", "profile": "service", "product": { "name": "FluxIQ", "logoUrl": "/product/assets/logo.svg" } },
  "origin": "https://getfluxiq.com", "gatewayUrl": "wss://getfluxiq.com/client",
  "connect": { "authorizeUrl": "/connect/authorize", "tokenUrl": "/api/connect/token",
               "revokeUrl": "/api/connect/revoke", "codeEntryUrl": "/connect", "signUpUrl": "/signup" },
  "protocols": { "clientGateway": ["0.1", "0.2"] },
  "minimumClient": { "browser-extension": "0.2.0" } }
```

**Flow A, primary: an authorization code with PKCE in a normal tab.** It follows OAuth 2.1 for native apps (RFC 8252) and PKCE (RFC 7636), with one public client kind.
1. The extension fetches discovery and creates a `code_verifier` (32 bytes), the S256 challenge, a `state` and a `client_install_id` for this server.
2. It opens a tab at `/connect/authorize?client_id=fluxiq-browser-extension&redirect_uri=<origin>/connect/done&code_challenge=..&code_challenge_method=S256&state=..&client_install_id=..&client_label=Chrome%20on%20Windows`.
3. If the browser is not signed in, the page asks the user to sign in, with a link to the product's sign-up. The tab shares the browser's cookies, so the user signs in once.
4. Consent shows the browser label, the workspace, and "can run your automations in this browser".
5. The server issues a code: 32 bytes, single use, 120-second TTL, bound to the challenge, install ID, user, workspace and approving panel session. It redirects to `/connect/done#code=..&state=..`. That page sends `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, loads no third-party resources, and never shows the code.
6. The extension accepts the URL only from its own tab, on the exact origin, with a matching `state`. It closes the tab and POSTs the token URL with `{grant_type: "authorization_code", code, code_verifier, redirect_uri, client_id, client_install_id}`.
7. The response is `{credential, credentialExpiresAt, connectedBrowserId, user {id, displayName}, workspace {id, name}, gatewayUrl}`. The extension connects with `client.hello.token = credential`.

**Why not `identity.launchWebAuthFlow`.**
- The redirect URI is the server's own page, so no extension IDs need registering.
- No `identity` permission is needed.
- The web-auth window reportedly has its own cookie store, which would mean signing in twice.
- Playwright can drive a normal tab.

A crafted link gains an attacker nothing: the code lands in the victim's own tab, and only the extension holding the verifier can exchange it.

**Flow B, fallback: a typed code.** Today's pairing, bound to a user.
- A hello without a credential gets `server.pairing_required {referenceCode, codeEntryUrl}`.
- The code is 8 characters from a crypto RNG with no ambiguous characters, and a 10-minute TTL. It replaces `Math.random`.
- The signed-in user types it at `/connect`; links never carry it. The approval screen shows the browser label and a coarse IP.
- Trust binds to the approver's workspace.
- At most 5 pending codes per IP and 1,000 in total.
- `local` keeps one-click approval, on loopback only.

**Connected-browser credential.** It evolves `client-gateway/service/trusted-clients.ts`.
- Fields:
  - `connectedBrowserId`, `userId`, `workspaceId`, `clientId`, `domainId`;
  - `label`, `browser`, `os`;
  - `createdAt`, `lastSeenAt`, `lastIpPrefix`;
  - `credentialHash`, `previousCredentialHash`, `previousValidUntil`, `expiresAt`;
  - `revokedAt`, `revocationReason`, `scopes`;
  - `approvingSessionId`, the panel session that approved it (see Keys).
- It rotates on every connect, which slides the expiry to 60 days. The previous credential stays valid once, for 2 minutes.
- Presenting an older credential revokes the browser, writes an audit event, and emails the owner.
- Fixed scope: gateway.connect, programs.read and write, runtime.control, flows.write. Confined to the workspace and domain through the endpoint allowlist; never identity, secret reveal or destructive endpoints.
- Bearer is valid only while the socket is ready on this host.
- At most 10 browsers per account under `service`.

**Revocation.**
- `/account/browsers`: one browser, or all of them.
- Optionally, a password change.
- Provisioning: `disableAccount`, `rotateCredentials`, `deleteAccount`.
- The operator kill switch, `revoke-all-browser-credentials`.
- Live sockets receive `server.revoked {reason}`.

**Client gateway 0.2.** Additive, in `packages/contracts/src/client-gateway.ts` and `service/protocol-version.ts`.
- `server.revoked {reason}`.
- `server.going_away {reason, retryAfterMs}`.
- `session_ready` gains `user`, `workspace` and `credentialExpiresAt`.
- `pairing_required` gains `codeEntryUrl`.
- Hello metadata gains `clientLabel`.
- Every action command gains `runContext {runId, actorUserId, workspaceId, origin: "extension-chat" | "panel" | "schedule" | "api", startedFromSessionId}`. The extension's consent and user checks depend on it.

**Migration.**
- Under single tenancy, trusted clients become browsers of their `approvedByUserId`.
- Legacy tokens keep working on loopback for two releases.
- Public profiles accept only user-bound credentials.

## Gateway Transport Over The Internet

**Same origin.**
- The proxy routes `/client` to the gateway: one certificate, port 443 only. The gateway stays plain `ws` behind it.
- `FLUXIQ_PUBLIC_CLIENT_WS_URL` becomes authoritative for status and discovery (`apps/web/src/lib/fluxiq.ts`).
- The bundle path in `gateway-runtime/load.ts` becomes configurable.

**Origin rule.** `FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS` (`apps/web/src/server/client-gateway-websocket.ts`) accepts:
- exact origins;
- `chrome-extension://<id>` (Chrome and Edge store IDs differ);
- `moz-extension://*` (Firefox uses a random UUID per install).

Web origins other than the panel's own are refused, and `*` stays refused. A missing Origin (a non-browser client) is allowed: the credential authenticates. Public profiles default to the product's IDs plus `moz-extension://*`.

**Limits.** Configurable, with metrics.
- 16 MiB frames to start.
- `client.hello` within 10 seconds.
- 50 messages per second, with bursts of 200.
- Ended sessions pruned.
- An audit ring of 10,000 entries per workspace, with security events persisted.
- Pending pairings capped as in Flow B.

**Client IP.** Taken from `X-Forwarded-For` only with `FLUXIQ_TRUST_PROXY`. Used for throttles, and audited as a prefix.

**Graceful drain.** On SIGTERM the server refuses new builds, sends `server.going_away {retryAfterMs}`, waits up to `FLUXIQ_DRAIN_SECONDS`, then exits.

**HTTP from the extension.** Background fetches under host permissions are not subject to CORS, so Core keeps sending no CORS headers. State-changing cookie requests get an `Origin` / `Sec-Fetch-Site` check, in a new `apps/web/src/middleware.ts` and in `lib/program-route.ts`. Bearer requests are exempt.

## Tenancy And Data

**Workspace.** The unit of isolation and ownership. Under `service`, `createAccount` with `workspace: "new"` creates a personal workspace. Memberships (`workspace.members`) are stored from the start, so teams can come later.

**Layout v3.** `multi` only.
- `<dataRoot>/platform/` is a FluxIQ root holding users, sessions, identities, workspaces, members, browsers, throttles and the platform audit.
- `<dataRoot>/workspaces/<workspaceId>/` is a complete root, as today. `workspaceId` is a random UUID.
- Under `single`, both are today's `.fluxiq` and no files move.

**Workspace manager.** New, in `apps/web/src/lib/workspaces/`, replacing `globalThis.__fluxiqWebRuntime`.
- A map from workspace to `{fluxiq, gateway, lastUsedAt}`.
- Lazy `FluxIQ.create({rootDir})` plus `applyFluxIQHostModule`.
- Idle eviction after 15 minutes with no requests, sockets or runs, with an LRU cap sized from S3.
- Route handlers call `workspaceFluxIQ(request)`. S4 lists the call sites first.

**Gateway per workspace.** One listener verifies the hello credential against the platform store, then hands the socket to that workspace's `ClientGatewayService`.

**Browser-owner invariant (every profile).** `selectSession` keeps only ready sessions whose `operatorUserId` is the run's actor, and loses the any-session fallback. The paired document applies the same rule in the domain.

**Per-workspace singletons** (S4 confirms): `automationStudioContexts`, the activity hub, host-lease scope (`project-agents/host-resources/lease-scope.ts`) and the step-log directory. Provider throttles stay process-wide.

**Storage engine.**
- SQLite per workspace, on an encrypted local volume.
- Postgres is deferred; the `PlatformStore` port makes the platform store its first candidate when cells are needed.
- An `ObjectStore` port waits until disk becomes the constraint.

**Quotas** (`service`): storage bytes and projects per workspace, and one concurrent build per workspace.

**Retention** (H2; defaults under `service`): runs 90 days, which needs run deletion plus wiring `AutomationStudioProjectRetentionStore` into a background task; unreferenced state assets 30 days; recordings and Flows until the user deletes them; platform audit 1 year.

**Export and import** (H2). `export-workspace` makes a consistent snapshot (the SQLite backup API plus artifacts) as a zip with a manifest. `import-workspace` loads one into an empty workspace. Same format in every profile.

**Deletion** (H1, through `deleteAccount`): revoke, evict, delete the workspace directory, remove the platform rows. Backups age it out within 30 days, and the privacy policy says so.

**Encryption at rest.** Encrypted volume and backups; keys sealed per user. Per-workspace data keys come later.

**Documentation.** `docs/operations/data-and-state.md` gains layout v3. `docs/architecture/platform.md` (new) records profiles, provisioning, authorization, tenancy and connect.

## Panel Customisation Extension Points

**Principles.** No fork; Core stays generic. Data first, code second. Core enforces auth on every extension surface. The theme contract holds: only a validated brand-accent subset, with contrast checked. Extensions are trusted host code, not a sandbox.

**Registration.**
- The host module gains an optional `registerFluxIQPlatform(platform)`, called once per process. `registerFluxIQHost` runs once per workspace instance.
- `platform` exposes the product registry, the hooks and `provisioning`.
- Contracts live in `packages/contracts/src/platform/`. The registry is `packages/fluxiq/src/platform/panel/`, exported as `fluxiq/platform`.
- `componentPacks` and `programExtensions` are deprecated.

**Layer 1: product manifest** (H1; data, at runtime; schema `PanelProduct`).
- `id`, `name`, `shortName`.
- `assets`: logo, favicon and sign-in art, served at `/product/assets/<name>`.
- `brand`: an accent subset.
- `links`: terms, privacy, support, status.
- `auth`: sign-in copy and the sign-up URL.
- `extensionStores`, and `extensionClients` (which feed the Origin defaults).
- `email`: sender and templates.

Server components read it, so there is no flash. Without a product, stock branding is used.

**Layer 2: declarative** (H2).
- `onboarding.steps[]`, each with an action and a server status check.
- `settings.sections[]`: a field schema. Values are stored per workspace in `panel.settings`, and the domain reads them through `fluxiq.panel.settings()`.
- `nav.items[]`.

**Layer 3: code plugins** (H1; build-time).
- **Build.** `FLUXIQ_PANEL_PLUGINS=<package>[,...]` at `next build`. `apps/web/scripts/generate-panel-plugins.mjs` writes `apps/web/src/plugins/generated/registry.ts`, importing each plugin's `./panel` (React) and `./server` entries.
- **Pages** mount at `/x/<pluginId>/[[...path]]` inside `AuthShell`. A page may declare `public: true`: it renders without a session, workspace or instance, and can call only its own plugin's public routes. The landing, terms, privacy and sign-up pages use this.
- **Slots** (`apps/web/src/plugins/slot.tsx`): `public.home` (the signed-out `/`), `auth.login.aside`, `home.sections`, `settings.sections`, `account.sections`, `topbar.actions`.
- **API routes** go through `apps/web/src/app/api/x/[pluginId]/[...path]/route.ts`. Each declares `access: "public" | "session"` and its permissions, and runs through `lib/operational-route-contract.ts`. Public routes are rate-limited, and can require the `HumanCheck`.
- **Server entry.** `./server` exports `registerPanelPlugin(platform)` and receives `provisioning`. This is how the product's sign-up route creates accounts.
- Plugins import only `fluxiq/ui` and `fluxiq/platform`. The stock build has none.

**Server hooks** (asynchronous, isolated from failure): `on("account.created" | "workspace.created" | "account.disabled" | "account.deleted" | "browser.connected" | "browser.revoked")`, `registerEmailTemplate`, `registerHumanCheck`, `registerBillingProvider`, `registerEntitlementPolicy`.

**What stays in Core:** the sign-in, setup, verify, reset, consent, connect, account, browsers and delete pages; provisioning; the slot runtime and auth enforcement; discovery, the theme and the program policy.

**What lives downstream:** the product manifest and assets, the public pages, the sign-up page and backend, the default-project hook and the extension client IDs. See the paired document's "Product Site And Panel Content".

## Model Calls, Keys And The Billing Port

**Bring your own key only, in every profile.** There is no platform key (user decision, 2026-10-18). Responsibility sits in the user agreement.

**Storage.**
- Each user's provider key lives in their own workspace's Secret Keys, sealed with AES-256-GCM under a key derived from their password. The operator cannot decrypt it at rest.
- Decrypted keys exist only in process memory, for that user's unlocked sessions (`held-keys.ts`).
- They are never revealed to the browser, to other users or to the operator.
- They are redacted from logs, step logs (off under `service`) and error reports. The existing outbound check stays.

**Selection bug fix (H1, a security fix).** `runtime/llm/deepseek/session-key.ts` releases the caller's own key or the Flow's `llmSecretKeyId`, never the first key of any user.

**Unlock.**
- Keys unlock at panel sign-in, and Flow A's tab sign-in counts.
- The browser records its `approvingSessionId`, so builds started from the extension use that session's unlock while the session lives. S5 verifies the current path.
- After a restart, unlocks are lost, and extension-started builds stop with "Sign in at getfluxiq.com to unlock your model key" (N4).
- H2 adds a browser-held unwrap key: the server wraps the user's key-encryption key with a random key that only the browser holds and presents at connect. Builds then survive restarts, the operator still cannot decrypt at rest, and OIDC users can keep keys too.

**Spend.**
- The per-Flow purse stays ($0.25 by default), now on the user's own key.
- An optional daily limit per user on their own key (H2, 1 to 2 days). The user sets it in account settings. It is enforced at the purse pre-check from a per-workspace daily counter updated at settlement.

**Billing.**
- `BillingProvider` and `EntitlementPolicy` exist as ports with no-op implementations (always allow). There is no meter, no ledger and no platform cap.
- Selling credits later plugs in through `registerBillingProvider`. A platform key would come only then, and only by a new decision.

**Abuse.** The human check on sign-up, per-IP limits on sign-up and connect, a verified email before connecting, `disableAccount`, and quotas.

## Deployment And Operations

Core ships generic packaging. The paired document owns the getfluxiq.com infrastructure and runbook.

- **Image** (`deploy/docker/Dockerfile`):
  - multi-stage on Node 22, with native `sqlite3` built for Linux;
  - `output: "standalone"` behind `FLUXIQ_WEB_STANDALONE=1`;
  - the gateway bundle, an optional host module, and the plugins;
  - non-root, with a read-only root except `/data`;
  - `HEALTHCHECK`.
- **Example deployment.** `deploy/compose/self-hosted.compose.yml` and `deploy/caddy/Caddyfile.example`. `docs/operations/self-hosting.md` covers DNS, the setup code, backups, upgrade, restore, and the licence note for running `multi` for third parties.
- **Runtime support.**
  - `/api/health` and `/api/ready`;
  - JSON logs, redacting tokens, cookies, codes, keys, passwords, request bodies and page data;
  - an internal Prometheus endpoint;
  - drain;
  - `migrate`, which takes a backup first. Migrations stay forward-only.
- **Scaling.** Vertical first. Then cells: hosts each owning a set of workspaces, with a router and the platform store on Postgres. Only when measured need appears.
- **CI.** An image smoke (health, discovery, a provisioning round trip), the public-profile Playwright smoke and Trivy. No deployment and no model calls.

## Security

**Assets:**
- accounts and sessions;
- connected-browser credentials, the highest value, because they let the server drive a signed-in browser;
- workspace data;
- users' provider keys.

**Actors:**
- anonymous internet users;
- a malicious tenant;
- a stolen device or credential;
- a hostile page, through prompt injection;
- a malicious custom server;
- an operator insider;
- a compromised provisioning caller;
- the supply chain.

| # | Risk | Mitigation (stage) |
| --- | --- | --- |
| 1 | A compromised or buggy server drives browsers | Browser-owner invariant in Core and the domain; consent-bound execution and the `runContext` check in the extension; browser-side gates for money, send and delete; activity overlay; kill switch (H1) |
| 2 | Cross-tenant leak | Workspace-per-root; workspace taken from the principal only; per-workspace gateway; endpoint classification and route matrix (H1) |
| 3 | Account takeover | Throttles per account and IP; verified email; TOTP; revocation; email on a new browser (H1); OIDC (H2) |
| 4 | Connect-flow abuse | PKCE S256; fixed same-origin redirect; single-use codes; `state`; typed codes never in links; consent (H1) |
| 5 | Provisioning misuse | Capability only in trusted host code; HTTP off by default, token hashed, source allowlist, rate limit; no content access; no `platform-admin`; audited (H1) |
| 6 | Operator surfaces exposed | Setup-code claim; program policy; fix the "check nothing" endpoints; hidden paths (H1) |
| 7 | CSRF | Origin and `Sec-Fetch-Site` middleware; `__Host-` cookie; SameSite=Lax (H1) |
| 8 | Denial of service | Frame, rate and pairing limits; pruning; quotas; proxy limits (H1) |
| 9 | Theft or misuse of a user's key | Password sealing; the operator cannot decrypt at rest; never revealed; redacted; selection fix; purse (H1); daily limit (H2) |
| 10 | Sensitive page data at rest | Extension-side screening (paired audit); encrypted volume and backups; step logs off; retention (H2) |
| 11 | Server-side code execution | Host module and plugins are build-time operator code; custom nodes refused under `multi`; audit the Flow DSL for server-side evaluation (H1) |
| 12 | Supply chain | Lockfile; `pnpm audit`; Dependabot; pinned images; Trivy (H1) |

**Secrets rules.** The provisioning token (if enabled), the SMTP credential, the setup code and, later, OIDC secrets live only as mounted files or CI secrets. They are never in `.fluxiq`, the image, logs or the repository. `SECURITY.md` gains the hosted boundaries.

**Exposure gate.** getfluxiq.com stays closed until all of these pass:
- the hardening checklist;
- the route matrix;
- a ZAP baseline with no high findings;
- the review checklist in `docs/operations/quality-and-security.md`.

An external penetration test is recommended. It can follow the Chrome release by a few weeks (N3).

## Testing

**Unit and integration tests,** each in the `tests/` folder beside its subject:
- **Identity:** verify and reset with the `file` sender; the owner claim; throttles.
- **Provisioning:** every operation; idempotency and the audit; refusal of content access and of `platform-admin`; the HTTP token, its rotation and the source allowlist.
- **Authorization:** `user` permissions; refusal of unclassified endpoints; the program policy.
- **Connect:** RFC 7636 vectors; code reuse and expiry; the redirect rule and `state`; rotation, sliding expiry, grace and reuse revocation; typed-code limits.
- **Transport and tenancy:** the Origin grammar, limits and drain; workspace manager load, eviction and host module per instance; the browser-owner invariant.
- **Keys:** the selection fix; redaction; the unlock tied to the approving session; the no-op billing ports.

**Route matrix** (`apps/web/src/app/tests/`).
- It enumerates `GlobalProgramApiRegistry` and every route, plugin routes included.
- It calls each as workspace A against B's identifiers, and each operator or platform endpoint as a `user`, expecting a refusal or not-found.
- It fails on any unclassified endpoint.

**Core Playwright** (`apps/web/e2e/public-profile/`). Runs under `service` behind Caddy `tls internal`, with a fixture product plugin. Journeys: the setup-code claim, sign-up through the fixture's provisioning route, verify, sign-in, consent, browsers, revoke, and disable through provisioning.

**Browser, Lab and staging coverage** is in the paired document. Live runs use the ten realistic scenarios only.

## Phases And Release Cut

Effort is in rough agent-days. Work merges as task branches on narrow checks.

H1 is one paired unit of work: one task ID in both repositories, nested worktrees with its own Core worktree. It takes `dev` in daily and merges back after the MVP release-candidate tag. Before the freeze, merges are limited to new modules that nothing on the local path references, and to hardening that is safe for local use.

| Work | Before freeze (to 10-29) | Freeze to 11-10 | After 11-10 |
| --- | --- | --- | --- |
| H0 decisions, spikes S1 to S5 | Yes | | |
| Contracts (discovery, connect, provisioning, gateway 0.2, panel product) | Merged (new files) | | |
| Platform store, provisioning and connect libraries, discovery route | Merged inert, if lanes are free | | |
| Local-safe hardening (frames, crypto codes, pairing caps, "check nothing" endpoints, throttle) | Yes; it helps the MVP | Approved freeze fixes only | |
| Tenancy wiring, call-site migration, classification | H1 worktree | Worktree | Merges after the release-candidate tag |
| Connect pages, gateway 0.2 wiring, extension sign-in (paired) | Worktree | Worktree | After the tag |
| Product site and sign-up (paired) | Worktree | Worktree | After the tag |
| Staging on getfluxiq.com | VM and DNS ready, closed | Closed, from the worktree build | Public after the gate |
| Chrome Web Store submission with sign-in | No | No | About 12-01 |

**H0** (10-18 to 10-22; 3 to 4 days; briefs go into this document before dispatch):
- S1 (paired D0): tab observation in Chrome, Edge and Firefox.
- S2: Caddy carrying `wss` to `next start` and the gateway on one origin.
- S3: memory and start time for N workspace instances.
- S4: an inventory of global-instance callers and singletons.
- S5: how extension-started builds release keys (`held-keys.ts`, `api/handlers/conversations.ts`), and which session a Bearer caller carries.

**H1: the hosted slice** (from 10-20; about 44 Core agent-days; lanes partitioned by files).
- **Lane A, hardening (8 to 10):**
  - profile resolution (`packages/fluxiq/src/platform/profile/`);
  - public origin, `wss` URL and gateway bundle path (`apps/web/src/lib/fluxiq.ts`, `gateway-runtime/load.ts`);
  - Origin grammar and limits (`apps/web/src/server/client-gateway-websocket.ts`);
  - pairing caps, crypto codes, pruning and the audit ring (`client-gateway/service/{pairings,sessions,audit-log}.ts`);
  - middleware and the `__Host-` cookie (`apps/web/src/middleware.ts`, `api/auth/login/route.ts`, `lib/auth.ts`);
  - throttles (`lib/login-attempts.ts`);
  - owner claim (`apps/web/src/app/setup/` and identity-access);
  - the "check nothing" endpoints, and hidden paths;
  - health, drain and logs; the discovery route;
  - docs: `docs/integrations/client-gateway-websocket.md`, `SECURITY.md`.
- **Lane B, platform, provisioning and authorization (10 to 12):**
  - `PlatformStore` (`packages/fluxiq/src/platform/store/`);
  - provisioning, its HTTP transport and the command line (`packages/fluxiq/src/platform/provisioning/`, `apps/web/src/app/api/platform/provisioning/`);
  - the `user` role and endpoint classification (`packages/fluxiq/src/platform/authorization/`, `programs/_shared/api.ts`, `identity-access/runtime/roles.ts`);
  - program policy;
  - `EmailSender`, verify and reset (`apps/web/src/app/{verify,reset}/`);
  - key selection fix and redaction (`session-key.ts`, the log redaction list);
  - the no-op billing ports;
  - `docs/architecture/platform.md`.
- **Lane C, tenancy (15 to 18; after S3, S4 and B's store):**
  - layout v3 (`framework/storage-layout.ts`);
  - workspace manager (`apps/web/src/lib/workspaces/`);
  - call-site migration in S4 batches;
  - gateway routing by credential;
  - the browser-owner invariant (`runtime/client-gateway-transport.ts`);
  - per-workspace singletons;
  - `deleteAccount` wiring;
  - the route matrix.
- **Lane D, connect (6 to 8; after A's gateway steps):**
  - contracts (`packages/contracts/src/platform/connect.ts`, `client-gateway.ts` 0.2);
  - codes and tokens (`packages/fluxiq/src/platform/connect/`);
  - credentials with `approvingSessionId` (`trusted-clients.ts`, `lifecycle.ts`, `access.ts`);
  - typed-code claim (`pairing-flow.ts`);
  - `apps/web/src/app/connect/`, `account/browsers` and `app/api/connect/`;
  - `revoked`, `going_away` and `runContext`;
  - trusted-client migration.
- **Lane E, panel layers 1 and 3 (5 to 6):**
  - product contracts and registry (`packages/contracts/src/platform/panel*.ts`, `packages/fluxiq/src/platform/panel/`);
  - loading `registerFluxIQPlatform`;
  - the assets route and branding (`layout.tsx`, `AuthShell.tsx`);
  - the generator, `public` pages, slots, routes with `access`, and the `./server` entry (`apps/web/src/plugins/`, `app/x/`, `app/api/x/`);
  - a fixture plugin in `apps/web/src/plugins/tests/`.
- **Lane F, operations packaging (4 to 5):** Dockerfile, compose and Caddy examples, metrics, `migrate`, the CI image job and scan, `docs/operations/self-hosting.md`.
- **Validation:** the tests beside each change, plus:
  - A: the S2 Caddy smoke (`wss` hello reaches pairing, a web Origin is refused, an oversized frame closes);
  - C: the route matrix;
  - D: the extension's D2 tests against each profile;
  - E: the fixture plugin and the contrast test.

**H1 gate** (11-11 to about 11-28). H1 merges into `dev`. getfluxiq.com staging passes:
- the route matrix;
- the paired Lab gate (`service-local`, two tenants, ui:e2e sign-in);
- ZAP;
- the Security table review;
- published terms and privacy;
- a reviewer test account.

The user approves the Chrome submission (about 12-01). getfluxiq.com opens on store approval.

**H2, after launch:**
- Google sign-in;
- the browser-held unwrap key;
- the per-user daily limit;
- retention and run deletion;
- export and import;
- layer 2;
- an operator web page;
- the billing adapter, when credits are sold;
- teams;
- Postgres and cells, when measured.

## Risks

- **MVP contention.** H1 runs beside the MVP lanes. If MVP qualification slips, H1's merge slips with it, and the MVP keeps priority.
- **Late merge.** H1 accumulates in a worktree through the freeze. Merge `dev` in daily, and keep the pre-freeze inert merges small.
- **Instance cost.** If S3 is heavy, evict harder, or split into a shared runtime with per-workspace storage, which would re-plan lane C.
- **Hidden globals.** S4, the route matrix and the two-tenant Lab scenario cover them.
- **Hand-written authorization.** The scope is small: one public client, code plus PKCE. RFC vectors and a review.
- **Unlock after restarts.** Users sign in again after a deploy until H2. Announce deploys, and drain.
- **One provider.** DeepSeek processing in China needs disclosure (Q8).
- **No legal entity.** Only the paired document's "Legal Prerequisites" need one, and none blocks the build.

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

## Open Questions

Owner: the user, for all of them. A recommendation follows each.

- **N1. When to submit to the Chrome Web Store?** Recommendation: at the H1 gate, about 12-01, so the first public listing has sign-in. A local-only listing at 11-10 is unusable for store users without the runtime from source, and costs two reviews.
- **N2. One origin, or a separate panel?** Recommendation: one origin, `https://getfluxiq.com`, for the website, sign-up, panel, API and `/client`, with `www` redirected and `status.getfluxiq.com` for status. Use `app.getfluxiq.com` only if the website ever leaves the Core deployment.
- **N3. Open sign-up, or invite codes, at launch?** Recommendation: invite codes or a waitlist for the first two weeks while the external penetration test runs, then open.
- **N4. Is signing in again after a server restart acceptable until H2?** Recommendation: yes for the Chrome release. The browser-held unwrap key follows in H2.
- **Q5. Sign-in providers?** Recommendation: email and password at the Chrome release; Google in H2; generic OIDC for self-hosters.
- **Q6. Teams?** Recommendation: personal workspaces only; the membership table exists from the start.
- **Q7. Hosting provider and region?** Recommendation: one VM (Hetzner or DigitalOcean, 4 vCPU, 16 GB) running Docker Compose, in the region of most expected users.
- **Q8. How should DeepSeek's processing in China be disclosed?** Recommendation: in the privacy policy and at key entry, with a second provider adapter after launch.
- **Q10. Operator console?** Recommendation: the command line at launch (accounts, disable, revoke all); a web page in H2.
