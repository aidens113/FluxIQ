# Hosted Production Plan

Status: Active
Status detail: Plan only, written 2026-10-17; no code changed; execution waits on the user's answers to the Open Questions and starts after the 2026-11-10 MVP release.
Created: 2026-10-17
Last updated: 2026-10-17
Owner: Lane lead hosted-production-planner (plan); the senior supervisor agent owns execution
Scope: Core side of running FluxIQ in production as one codebase with three deployments (the owner's hosted service, local, self-hosted on a server): identity, extension sign-in protocol, gateway transport, tenancy and storage, panel extension points, model spend, deployment, security, tests, phases. Browser, store, product and Lab work is in the paired document.
Paired document: C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/docs/working/hosted-production-plan.md
Related: [package boundaries](../architecture/package-boundaries.md), [current system](../architecture/current-system.md), [client gateway](../integrations/client-gateway-websocket.md), [data and state](../operations/data-and-state.md), [quality and security](../operations/quality-and-security.md), [ui theme](../architecture/ui-theme.md), [MVP final month](./mvp-final-month-plan.md), [working index](./README.md)

---

## Current State

**What is true now.** This is a plan. Nothing has been implemented, and no file other than the two paired plan documents was edited. The findings under "Current System Baseline" come from a read-only audit of Core and the web-extension repository on 2026-10-17. The load-bearing claims were re-checked in the code (paths are cited there).

**The user's requirements** (2026-10-17):
- The FluxIQ website runs on the user's domain. Ordinary extension users sign in there, and their extension connects through it.
- The panel must be customisable for the product, as a framework feature rather than a fork.
- Binding: self-hosting stays first-class. One codebase must support three deployments: (1) the user's hosted service; (2) a person running their own panel locally, as today; (3) a person hosting their own panel on their own server or website.
- The extension must be able to connect to any of the three: pick a server or enter a URL, sign in, and keep that per browser.
- Single-user self-hosting must work without the multi-user machinery.

**Recommended architecture.**
- **One server image and three profiles.**
  - `FLUXIQ_PROFILE=local|self-hosted|service` sets defaults, and each setting can be overridden on its own.
  - The server keeps doing what it does today: panel, API, client gateway, model calls and storage. The browser keeps doing all page work through the extension.
  - The hosted service is multi-tenant, but each workspace gets its own FluxIQ root (its own SQLite files and artifact folder). The server process holds one lazily loaded FluxIQ instance per active workspace, and a small platform layer above them handles accounts, sessions, workspaces, connected browsers and usage.
  - Single tenancy (local and self-hosted by default) is today's layout, unchanged: one workspace whose root is today's `.fluxiq`.
- **Identity stays in Core.**
  - The identity-access program gains sign-up, email verification, password reset and generic OIDC sign-in (Google first). Sessions stay opaque cookie sessions.
  - First-run admin/admin is replaced by an owner claim. On a public server, the claim needs a one-time setup code from the server console.
- **The extension signs in through the website.** The primary flow is an authorization code with PKCE, run in a normal browser tab. The extension opens `<origin>/connect/authorize`; the user signs in or signs up there and approves; the server redirects to its own `/connect/done#code=...`; the extension reads the code from that tab and exchanges it.
  - This needs no new manifest permission, no redirect registration per extension ID, and works the same against any server URL.
  - Fallback: the user types the code shown in the extension into `/connect`. This is today's pairing, now bound to the signed-in user.
  - Both flows end in today's rotating per-browser credential, now bound to a user and a workspace, listed on a "Connected browsers" page, and revocable.
- **Transport.** A reverse proxy (Caddy recommended) terminates TLS. The gateway is served at `wss://<origin>/client` on the panel's own origin. The Origin rule admits extension schemes and refuses web origins. Frame, rate and pairing limits, plus graceful drain, are added.
- **Panel customisation, in three layers.**
  - (1) A data-only product manifest: name, logo, brand accent, links, login copy, store links.
  - (2) Declarative onboarding steps, settings sections and nav items.
  - (3) Build-time code plugins for slots and pages under `/x/<plugin>`, plus server hooks and plugin API routes under `/api/x/<plugin>`.
  - All of them are registered through the existing host module, with Core enforcing auth on every surface.
- **Money.**
  - The hosted profile uses a platform DeepSeek key held server-side, with a usage meter, per-workspace daily and monthly caps, a platform daily ceiling and alerts. Bring-your-own-key is optional.
  - Local and self-hosted keep bring-your-own-key.
  - Billing is a Core port. Stripe comes later, as an optional adapter.
- **Deployment.** One VM with Docker Compose (Caddy, the FluxIQ product image, a backup job). Staging and production, GitHub Actions deploys behind a manual gate, restic backups off site, structured logs, metrics and alerts. Scaling is vertical first, then by cells.

**Contract ownership.** This document owns the domain-neutral contracts:
- the discovery document;
- the connect (authorize, token, revoke, typed-code) protocol;
- the connected-browser credential model;
- client gateway 0.2 messages;
- profiles and tenancy;
- panel extension points;
- usage, entitlement and billing ports.

The paired document owns the extension's server profiles and sign-in client, manifests and store review, data minimisation, consent-bound execution, the product's panel content, the hosted-service infrastructure, the user docs and privacy policy, and Lab and e2e coverage.

**Schedule.** The MVP is local-only by its own plan: freeze 2026-10-29, deadline 2026-11-10, and the MVP documents defer hosted infrastructure.
- Recommended: nothing for hosting merges into `dev` before the MVP release. Phase 0 (decisions and throwaway spikes) runs now.
- Phases 1 and 2 start 2026-11-11. They deliver self-hosting on the web, with sign-in, in about two to three weeks.
- Phases 3 to 7 (tenancy, accounts, customisation, money, operations) run in three or four parallel lanes. That points to a closed beta of the hosted service in early January 2027.
- All efforts are rough and unmeasured.

**Next.**
1. The user answers the Open Questions (Q1 to Q6 block Phase 0's exit).
2. The supervisor dispatches the Phase 0 spikes, in throwaway worktrees with nothing merged:
   - S1: the tab-based connect flow in Chrome, Edge and Firefox against a stub server.
   - S2: Caddy in front of the panel and the gateway, carrying wss on the same origin.
   - S3: memory and start time per loaded workspace instance.
   - S4: an inventory of every call site that reaches the global FluxIQ instance, and every process singleton.
3. The supervisor turns Phase 1's steps into briefs.

**Blocked.** Implementation is blocked on the Open Questions and on the MVP freeze. Planning is not blocked.

**Not verified.** None of these was tested:
- Edge and Firefox behaviour of tab URL observation for the completion page (S1).
- Whether the `identity` permission would add an install warning. It is not needed under this plan.
- Firefox `data_collection_permissions` category names for authentication data.
- Memory per workspace instance (S3).
- Whether Next.js serves `app/.well-known/` directly; a rewrite is planned either way.
- The reported separate cookie store of `launchWebAuthFlow`, which comes from one web report.

## Current System Baseline

Paths are relative to this repository unless prefixed `ext:` (the web-extension repository). All were read on 2026-10-17.

- **Panel.** Next.js 15 App Router in `apps/web`, run by `next start --hostname 127.0.0.1` (`apps/web/package.json`, port 3000).
  - It fetches same-origin relative URLs only and polls; there is no panel WebSocket.
  - Login is `apps/web/src/app/AuthShell.tsx`. Every page checks the session on the server (`apps/web/src/lib/auth.ts`).
  - "FluxIQ" is hard-coded in `app/layout.tsx` and `AuthShell.tsx`.
  - The program catalog is the fixed `GLOBAL_PROGRAMS` in `packages/fluxiq/src/programs/_shared/catalog.ts`.
- **Gateway.**
  - A hand-written WebSocket server on `node:http` (`apps/web/src/server/client-gateway-websocket.ts`), on its own port, 4777 `/client`. It is started in-process by `startSharedClientGateway` (`apps/web/src/lib/fluxiq.ts`) and loaded through `src/server/gateway-runtime/load.ts`, which resolves its bundle from `process.cwd()`.
  - It throws when bound beyond loopback without a restrictive `FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS`; an empty list admits every Origin.
  - `publicUrl` is always `ws://`, and `0.0.0.0` is rewritten to `127.0.0.1`. Runtime status prefers that computed URL over `FLUXIQ_PUBLIC_CLIENT_WS_URL`.
  - Unbounded: frame size (only a `MAX_SAFE_INTEGER` check), session records (never pruned, `client-gateway/service/sessions.ts`), the audit log (`service/audit-log.ts`), and pending pairings.
- **Identity.** The identity-access program (`packages/fluxiq/src/programs/identity-access/runtime/service.ts`).
  - Users, the roles `admin` and `viewer`, scrypt credentials, TOTP and PIN.
  - Opaque cookie sessions stored as SHA-256, with a 12-hour TTL, in `identity.users` of `.fluxiq/global.sqlite`.
  - A default admin/admin is created on first start. There is no self-signup; only admins create users.
  - Login throttling: 100 failures anywhere lock every user out (`apps/web/src/app/api/auth/login/route.ts`). Per-address limits apply only with `FLUXIQ_TRUST_PROXY`.
  - The cookie `fluxiq_session` is httpOnly and SameSite=Lax, and Secure only when `NODE_ENV=production`.
  - There is no CSRF or Origin check, no CORS, and no `middleware.ts`.
- **Pairing.**
  - The client sends `client.hello`. The server answers `server.pairing_required` with a six-digit code made with `Math.random` (`client-gateway/service/pairings.ts`). Any signed-in `runtime.control` user approves it (`pairing-flow.ts`). Clients cannot submit codes.
  - Token: 32 random bytes, stored as SHA-256 in the `program.state` row `client-gateway/trusted-clients` (`trusted-clients.ts`). It is bound to the clientId, the approving user and the domainId. It expires after 30 days, rotates on every connect, and rotation does not extend the expiry.
  - HTTP Bearer is valid only while that client's socket is ready in the same process. Permissions are cut to {programs.read, programs.write, runtime.control, flows.write}, and only an allowlist of endpoints accepts it (`client-gateway/service/access.ts`, `apps/web/src/lib/program-route.ts`).
  - Revocation is the `revoke-client-trust` endpoint.
- **Single-tenant assumptions.**
  - One FluxIQ instance per process, held on `globalThis` (`apps/web/src/lib/fluxiq.ts`), with one root and one domain.
  - Projects have no owner (`programs/automation-studio/api/contracts/project.ts`: id, name, description, domainId, categoryId, timestamps); neither do Flows, recordings, runs or datasets. The only partition is `domainId`.
  - Every `runtime.control` user sees every pairing, session and trusted client.
  - `selectSession` falls back to any ready session with matching capabilities, whoever owns it (`packages/fluxiq/src/runtime/client-gateway-transport.ts`).
  - Process singletons: activity hub, host-lease scope, LLM retry ledger, endpoint load, password-hash limiter, and the `automationStudioContexts` map.
- **Storage.**
  - Node `sqlite3`: `global.sqlite`, `domains/<id>/domain.sqlite`, and per project `project.sqlite`, which has 26 forward-only migrations (`programs/automation-studio/storage/project/schema/`).
  - The project SQL is SQLite-specific: `on conflict` (about 71 uses), FTS5, rtree, `begin immediate`.
  - The object and content stores are concrete filesystem classes. Locks and queues are in-process.
  - `Repository<T>` (`programs/database-manager/types.ts`) is the only backend-neutral interface.
  - Most `*.json` paths are rows in `program.state` and `automation.state` (`programs/_shared/storage.ts`).
- **Secrets.**
  - Secret Keys are sealed with AES-256-GCM under the creator's password-derived key, and unlocked into process memory at login (`programs/secret-keys/runtime/value-sealer.ts`, `held-keys.ts`).
  - The DeepSeek key is chosen as the first enabled `llm` key across all users (`programs/automation-studio/runtime/llm/deepseek/session-key.ts`). It does not consider the caller or the Flow's `llmSecretKeyId`.
- **Model spend.**
  - DeepSeek only.
  - The per-run ceiling defaults to $0.25 (maximum $10), with a per-Flow-creation purse and a 250-call backstop (`programs/automation-studio/model/run-cost-ceiling/`, the build purse).
  - No per-user metering, quota or billing exists.
- **Retention and export.**
  - Projects and recordings can be deleted. Runs cannot be deleted on their own.
  - `AutomationStudioProjectRetentionStore` has no production caller.
  - Exports exist for datasets and run audits only. There is no workspace export or import.
- **Domain hooks.**
  - `FLUXIQ_HOST_MODULE` exports a synchronous `registerFluxIQHost(fluxiq)`, applied to each instance (`apps/web/src/lib/fluxiq.ts`, `applyFluxIQHostModule`).
  - `DomainRegistration.componentPacks` and `programExtensions` are declared (`packages/fluxiq/src/domains/index.ts:53-54`) but used nowhere.
  - A domain has no way to add pages, slots, routes, settings or branding.
- **Operator-only surfaces.**
  - Deployment Sync runs `git` in the host root. Database Manager browses the SQLite files. Docs reads `<root>/docs`. Runtime status returns the absolute `hostRoot` and `fluxiqDir`.
  - `package-boundaries.md` lists endpoints that "still check nothing": `run-migration`, `deployment-sync/sync` and `rollback`, `revoke-session`, `lock-vault`.
- **Hosting.**
  - No Dockerfile, deployment, TLS or proxy support exists. CI checks, tests and builds, but does not deploy or run Playwright.
  - Licence: the Sustainable Use License (`LICENSE.md`). Hosted, managed or multi-tenant service by licensees needs a commercial agreement (`COMMERCIAL-LICENSING.md`). The licensor identity is "not yet finalised" (`package-boundaries.md`).

## Target Topology

```
 user's browser                                   server: one container image per deployment
 +------------------------------+  wss /client   +---------------------------------------------+
 | FluxIQ extension             | ------------->  | reverse proxy, TLS  (Caddy; none for local) |
 |  chat, recording, executes   |  https /api     |   /        -> Next.js panel + API  :3000    |
 |  every page action           | ------------->  |   /client  -> client gateway       :4777    |
 +------------------------------+                 | platform layer: accounts, sessions,         |
 +------------------------------+  https          |   workspaces, connected browsers, usage     |
 | panel tab (app.<domain>)     | ------------->  | workspace manager: one FluxIQ instance per  |
 +------------------------------+                 |   active workspace root, lazily loaded      |
                                                  | model calls -> DeepSeek (key never leaves)  |
                                                  +---------------------------------------------+
```

**Decision: one multi-tenant service, isolated by workspace root, on a single host first.**

**What runs where.**
- The server runs the panel and API, the client gateway, the platform layer, Flow authoring and runtime logic, every model call, storage, and background tasks.
- The browser (the extension) runs page observation, every page action, recording, the chat UI, sensitive-field screening, and the permission prompts for lasting acts.
- The server never runs a browser. The product drives the user's own browser and its signed-in sites.

**Alternatives considered.**

| Option | Verdict | Why |
| --- | --- | --- |
| Per-user instances: a container and process per user, routed by subdomain | Rejected | One Next.js process per user (hundreds of MB each, cold starts); an orchestrator; a second identity layer in front for sign-in and routing; N migrations and N backups |
| Shared-schema multi-tenancy: tenant column, Postgres | Rejected for now | A rewrite of SQLite-specific project SQL and filesystem stores. Every missed `where tenant=` is a cross-tenant leak |
| Serverless or edge hosting | Rejected | The long-lived gateway WebSocket, in-process state and native `sqlite3` |
| **Workspace-per-root inside one process** (chosen) | Recommended | Each workspace is a complete FluxIQ root, so every single-user invariant inside Core still holds within a workspace. Isolation is at the storage level. Export, delete and backup work per directory. Local and self-hosted keep today's layout |

**Three deployment profiles on one codebase.** `FLUXIQ_PROFILE` sets defaults; each line can be overridden by its own setting.

| Setting | `local` (today) | `self-hosted` (own server or website) | `service` (owner's hosted service) |
| --- | --- | --- | --- |
| Public origin `FLUXIQ_PUBLIC_ORIGIN` | none; `http://127.0.0.1:3000` | `https://fluxiq.example.org` | `https://app.<domain>` |
| Gateway URL advertised | `ws://127.0.0.1:4777/client` | `wss://<origin>/client` | `wss://app.<domain>/client` |
| TLS | none | proxy (Caddy, automatic certificates) | proxy |
| Tenancy `FLUXIQ_TENANCY` | `single` | `single` (`multi` possible, but licence-bound) | `multi` |
| Sign-up `FLUXIQ_SIGNUP` | owner claim only | `closed` or `invite` | `open` or `invite` |
| Identity providers | password | password, optional OIDC | password and Google (OIDC) |
| Email sender | none (operator reset command) | optional SMTP | required |
| Connect flows | tab flow, typed code, one-click approve on loopback | tab flow, typed code | tab flow, typed code |
| Model key source | bring your own (password-sealed) | bring your own (master-key or password sealing) | platform key; bring your own optional (master-key sealing) |
| Metering and caps | per-run purse (today) | per-run purse | meter, workspace and platform caps, billing port |
| Operator programs (Deployment Sync, Database Manager, root Docs, Compute Control) | on for owner | on for owner | off for tenants; operator command line only |
| LLM step logs | developer opt-in | opt-in | off |
| Backups | the user's own | guide in `docs/operations/self-hosting.md` | managed (paired document) |

**Identical in all three:** the extension and its sign-in protocol, the discovery document, the gateway protocol, workspace contents and storage engine, the domain host module, the panel extension points, the build loop, and the export format (so a workspace moves between deployments).

**What differs:** profile defaults, the tenancy resolver, TLS termination, sign-up and providers, the key source, metering enforcement, which operator programs are available, and operations.

**Single tenancy carries none of the multi-user machinery:** no workspace registry beyond the constant single workspace, no layout change, no email requirement, no billing; the platform data lives in the existing `global.sqlite`.

## Identity And Sessions

**Decision: Core owns identity, by extending the identity-access program.** An external managed IdP (Auth0, Clerk) is rejected as the default, because it would split self-hosting and hosting into two code paths. A hosted operator can still plug one in as a generic OIDC provider, with no code change.

**Providers port** in `packages/fluxiq/src/programs/identity-access/runtime/providers/`:
- `password`: the existing scrypt path.
- `oidc`: a generic OpenID Connect relying party with discovery, PKCE, nonce and state, using a well-reviewed library such as `openid-client`. Presets: Google first. GitHub needs a plain OAuth2 special case, so it comes later.
- Self-hosters can point the OIDC provider at Keycloak, Authentik or Entra.

**Account record.** The user gains `email`, `emailVerifiedAt`, `displayName`, `identities[]` as `{provider, subject}`, `status` (active, suspended, deleted) and `createdVia`.

**Roles.** Under single tenancy, `admin` and `viewer` keep their meaning. Under multi tenancy, a user is the `owner` of their personal workspace; a separate platform role, `platform-admin`, is for the operator, and tenants never hold it. Role management stays in Core.

**Sign-up and verification.**
- New endpoints in identity-access, exposed through `apps/web/src/app/api/auth/`: `signup`, `verify-email`, `request-password-reset`, `reset-password`, `oidc/[provider]/start`, `oidc/[provider]/callback`.
- An `EmailSender` port with `none`, `smtp` and `file` (tests). Email templates can be overridden by the product (see Panel Customisation).
- A `HumanCheck` port: no-op by default, with a Turnstile adapter. It applies to sign-up and to logins that follow failures.
- Under `service`, model spend requires a verified email.

**Owner claim replaces admin/admin.** Under `local`, the first visit from loopback creates the owner. Under `self-hosted` and `service`, the server prints a one-time setup code to its console at first boot (or reads `FLUXIQ_SETUP_CODE_FILE`), and `/setup` requires it. Without this, a freshly deployed public server is taken over by whoever reaches it first.

**Sessions.**
- They stay opaque random IDs stored as digests (today's model).
- Public profiles use the cookie `__Host-fluxiq_session`: Secure, HttpOnly, SameSite=Lax, Path=/.
- Idle TTL stays 12 hours. "Keep me signed in" gives 30 days, sliding, under `service`.
- Existing re-authentication and the PIN still guard sensitive and destructive acts.
- Changing the password revokes the user's other sessions, and offers to revoke connected browsers as well.
- The cookie name change touches the Lab's cookie parser (see the paired document).

**Throttling.**
- Sliding windows per account and per client IP, with IP taken from the proxy only when `FLUXIQ_TRUST_PROXY` is set.
- They are stored in the platform store rather than in `security/login-*.json`.
- The global 100-failure lockout is removed: it lets any visitor deny service to everyone. It is replaced by an alert on global anomalies.
- The password-hash limiter, currently two at a time per process, becomes configurable.

## Extension Client Sign-In Protocol

This contract is owned here. The paired document owns the browser-side client.

**Discovery.** `GET /.well-known/fluxiq` is served through a `next.config.ts` rewrite to `/api/discovery`. Its schema is `packages/contracts/src/platform/discovery.ts`. It carries no secrets and is cacheable for five minutes.

```json
{ "fluxiqDiscoveryVersion": 1,
  "instance": { "name": "FluxIQ", "profile": "service", "product": { "name": "...", "logoUrl": "/product/assets/logo.svg" } },
  "origin": "https://app.<domain>", "gatewayUrl": "wss://app.<domain>/client",
  "connect": { "authorizeUrl": "/connect/authorize", "tokenUrl": "/api/connect/token",
               "revokeUrl": "/api/connect/revoke", "codeEntryUrl": "/connect" },
  "protocols": { "clientGateway": ["0.1", "0.2"] }, "signup": "open",
  "minimumClient": { "browser-extension": "0.2.0" } }
```

**Flow A, primary: a browser-tab authorization code with PKCE.** It follows OAuth 2.1 for native apps (RFC 8252) and PKCE (RFC 7636), with one registered public client kind.
1. The extension fetches discovery. It creates a `code_verifier` (32 random bytes), the S256 `code_challenge`, a `state`, and a per-server `client_install_id`.
2. It opens a normal tab at `/connect/authorize?client_id=fluxiq-browser-extension&redirect_uri=<origin>/connect/done&code_challenge=..&code_challenge_method=S256&state=..&client_install_id=..&client_label=Chrome%20on%20Windows`.
3. If the browser is not signed in, the page shows sign-in (password, OIDC, link to sign-up). The normal tab shares the browser's cookies, so a user already signed in to the website signs in only once.
4. Consent screen: browser label, workspace name, and "can run your automations in this browser". The user approves.
5. The server issues a code: 32 bytes, single use, 120-second TTL. It is bound to the challenge, the install ID, the user and the workspace. The server redirects to `/connect/done#code=..&state=..`.
   - The done page sets `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, loads no third-party resources, and never shows the code.
6. The extension accepts the URL only from the tab it opened, on the exact origin it is signing in to, with a matching `state`. It closes the tab and POSTs `tokenUrl` with `{grant_type: "authorization_code", code, code_verifier, redirect_uri, client_id, client_install_id}`.
7. The response is `{credential, credentialExpiresAt, connectedBrowserId, user: {id, displayName}, workspace: {id, name}, gatewayUrl}`. The extension then connects to the gateway with `client.hello.token = credential`.

**Why Flow A, and not `identity.launchWebAuthFlow`.** The redirect URI is the server's own fixed page, so self-hosted servers and unpacked builds need no registration of extension IDs. No `identity` permission is added. The web auth window reportedly has its own cookie store, which would mean signing in twice. Playwright can drive a normal tab, which matters for the Lab.

A link crafted by an attacker gains nothing: the code lands in the victim's own tab, and only the extension holding the verifier can exchange it. `launchWebAuthFlow` stays a possible later option.

**Flow B, fallback: typed code (today's pairing, user-bound).**
- The extension sends `client.hello` without a credential. The server answers `server.pairing_required {referenceCode, codeEntryUrl}`.
- The code is 8 characters from a crypto RNG, in an alphabet without ambiguous characters, with a 10-minute TTL. It replaces `Math.random` in `pairings.ts`.
- The signed-in user types the code at `/connect`. Links never carry it, because a pre-filled link is the phishing vector. The approval screen shows the browser label and a coarse IP.
- Trust binds to the approving user and their workspace. `server.session_ready` goes out on the pending socket.
- Limits: 5 pending codes per IP and 1,000 in total.
- The `local` profile keeps today's one-click approval of pending requests, on loopback only.
- Flow B serves the Lab's typed-code tests, browsers where tabs cannot be observed, and older servers.

**Connected-browser credential.** This evolves today's trusted client in `packages/fluxiq/src/client-gateway/service/trusted-clients.ts`.
- Record: `connectedBrowserId`, `userId`, `workspaceId`, `clientId` (install ID), `domainId`, `label`, `browser`, `os`, `createdAt`, `lastSeenAt`, `lastIpPrefix`, `credentialHash`, `previousCredentialHash`, `previousValidUntil`, `expiresAt`, `revokedAt`, `revocationReason`, `scopes`.
- Rotation: the credential rotates on every connect (today's behaviour). Rotation now slides `expiresAt` to 60 days from use.
- The previous credential stays valid once, for 2 minutes, so a crash before the new one is saved does not lock the browser out.
- Presenting an older credential is treated as theft: the browser is revoked, an audit event is written, and the owner is emailed.
- Scope is fixed: {gateway.connect, programs.read, programs.write, runtime.control, flows.write}, confined to the workspace and domain, through today's endpoint allowlist. It never covers identity.manage, secret reveal or PIN-gated endpoints.
- HTTP Bearer stays valid only while that browser's socket is ready on this host.
- Cap: 10 connected browsers per account under `service`.

**Revocation.** From the user's `/account/browsers` page (revoke one, or sign out everywhere), optionally on password change, by the operator command `revoke-all-browser-credentials` (kill switch), and on account deletion. A live socket receives `server.revoked {reason}` and is closed.

**Client gateway 0.2.** Additive and backward compatible, in `packages/contracts/src/client-gateway.ts` and `client-gateway/service/protocol-version.ts`:
- `server.revoked {reason}`;
- `server.going_away {reason, retryAfterMs}`;
- `server.session_ready` gains `user`, `workspace` and `credentialExpiresAt`;
- `server.pairing_required` gains `codeEntryUrl`;
- hello metadata gains `clientLabel`;
- every action command gains `runContext {runId, actorUserId, workspaceId, origin: "extension-chat" | "panel" | "schedule" | "api", startedFromSessionId}`. The extension's consent-bound execution (paired document) and its user check depend on this field.

**Migration.** Under single tenancy, existing trusted clients become connected browsers of their `approvedByUserId`. Legacy tokens keep working on loopback for two releases. Public profiles accept only user-bound credentials.

## Gateway Transport Over The Internet

**Same origin.**
- The proxy routes `/client` on the panel's origin to the gateway at `127.0.0.1:4777`, or to the container network. That means one certificate, port 443 only, and nothing extra to open in firewalls.
- The gateway itself stays plain `ws` behind the proxy.
- `FLUXIQ_PUBLIC_CLIENT_WS_URL` becomes authoritative for runtime status and discovery; this changes the computed-URL preference in `apps/web/src/lib/fluxiq.ts`.
- The bundle path in `src/server/gateway-runtime/load.ts` becomes configurable rather than tied to `process.cwd()`, so the standalone image can find it.

**Origin rule.** The grammar of `FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS` (`apps/web/src/server/client-gateway-websocket.ts`) extends to exact origins, `chrome-extension://<id>` for the product's store IDs (Chrome and Edge differ), and `moz-extension://*` (Firefox assigns a random UUID per install).
- Web `http(s)` origins other than the panel's own are refused, and `*` stays refused.
- A missing Origin (non-browser clients) is allowed: cross-site WebSocket hijacking needs a browser, and browsers always send Origin. The credential, not the Origin, is the authentication.
- Public profiles default to the product's extension IDs plus `moz-extension://*`.

**Limits** (each configurable and counted in metrics): frame and message size 16 MiB to start, tuned from metrics; `client.hello` within 10 seconds; 50 messages per second per connection, bursts of 200; ended sessions pruned; the audit log a ring of 10,000 entries per workspace, with security events persisted; pending-pairing caps as in Flow B.

**Client IP and proxies.** `X-Forwarded-For` is read only when `FLUXIQ_TRUST_PROXY` is set. The IP is used for throttles, and is audited as a prefix.

**Graceful drain.** On SIGTERM the server refuses new builds, sends `server.going_away {retryAfterMs}`, waits up to `FLUXIQ_DRAIN_SECONDS` for running builds, and exits. Clients reconnect with jitter (paired document).

**HTTP from the extension.**
- The extension's background fetches run under its host permissions, so they are not subject to CORS. Core therefore keeps sending no CORS headers, which keeps web pages from calling the API cross-origin.
- Cookie-authenticated requests that change state get an `Origin` / `Sec-Fetch-Site` check in a new `apps/web/src/middleware.ts`, plus the route wrappers in `lib/program-route.ts`. Bearer requests are exempt.

## Tenancy And Data

**Workspace.** The unit of isolation and ownership.
- Under `service`, sign-up creates a personal workspace.
- Memberships are stored from the start (`workspace.members`: userId, role), so teams can come later without a migration.
- MVP hosted scope: one owner per workspace. Teams are out of scope.

**Layout.** Storage layout v3 applies only under `multi`. It is set up when a deployment starts under `multi`, and is never forced on single tenancy.
- `<dataRoot>/platform/` is a FluxIQ root holding only platform state in its own `global.sqlite`: users, sessions and linked identities; workspaces and members; connected browsers; usage events and rollups; throttles; platform audit.
- `<dataRoot>/workspaces/<workspaceId>/` is a complete FluxIQ root exactly as today: `config.json`, `global.sqlite`, `domains/<id>/domain.sqlite`, `artifacts/automation-studio/projects/...`.
- `workspaceId` is a random UUID, never derived from user input.
- Under `single`, the platform root and the only workspace root are both today's `.fluxiq`. No files move.

**Workspace manager.** New, in `apps/web/src/lib/workspaces/`. It replaces the single `globalThis.__fluxiqWebRuntime`.
- A map from workspace to `{fluxiq, gateway, lastUsedAt}`.
- Lazy creation: `FluxIQ.create({rootDir})`, then `applyFluxIQHostModule`.
- Idle eviction after 15 minutes with no requests, sockets or active runs, and an LRU cap on loaded instances, sized from spike S3.

**Resolution rule.**
- Every request resolves its workspace from the authenticated session (cookie) or credential (Bearer or socket), never from a path or body parameter.
- Route handlers stop calling the global instance and call `workspaceFluxIQ(request)`.
- Spike S4 inventories the call sites first.

**Gateway per workspace.**
- One listener serves all workspaces. It verifies the hello credential against the platform store, then hands the socket to that workspace's `ClientGatewayService`.
- Pairing views, session lists and audit are then per workspace automatically.

**Browser-owner invariant, in every profile.**
- A browser executes only for its own signed-in user.
- `selectSession` in `packages/fluxiq/src/runtime/client-gateway-transport.ts` filters ready sessions by `operatorUserId === run actor` before it applies capability matching, and it loses the any-session fallback.
- The paired document applies the same rule in the domain's session selection.

**Per-workspace singletons** (spike S4 confirms the list): `automationStudioContexts` (keyed by workspace and user), the activity hub, host-lease scope (`project-agents/host-resources/lease-scope.ts`), and the LLM step log directory. Provider-level throttles (retry ledger, endpoint load) stay process-wide.

**Program availability policy.** New, in `packages/fluxiq/src/programs/_shared/`.
- Each profile declares which programs tenants see.
- Under `service`, tenants get Automation Studio, Secret Keys (bring your own key) and the packaged Docs reference.
- Deployment Sync, Database Manager, Compute Control, root Docs, custom node directories and production-runner administration are hidden and refused at the API.
- Under `service`, runtime status no longer returns `hostRoot` or `fluxiqDir`.

**Storage engine.**
- SQLite per workspace, as today, on the host's local encrypted volume.
- Postgres is deferred. Its triggers: cells that need a shared platform store, or cross-workspace queries.
- Behind the `PlatformStore` port, the platform store is the first and only candidate to move to Postgres. Workspace data stays SQLite.
- An `ObjectStore` port, for S3-compatible artifact storage, is deferred until disk is the constraint.

**Quotas** (per workspace under `service`, defaults set by the user): storage bytes (a background task measures directory size), number of projects, concurrent builds.

**Retention** (defaults under `service`; configurable in every profile): runs and run events 90 days; unreferenced state assets 30 days; recordings and Flows until the user deletes them; platform audit 1 year; LLM step logs off. Run retention needs run deletion, which does not exist today, plus wiring `AutomationStudioProjectRetentionStore` into a scheduled background task.

**Export and import.**
- `export-workspace` takes a consistent snapshot (the SQLite backup API for each database, plus the artifacts) and produces a zip with a manifest `{formatVersion, coreVersion, domainIds, createdAt}`.
- `import-workspace` loads it into an empty workspace.
- The same format serves all three profiles, so users can move between local, self-hosted and hosted.

**Deletion.** Account deletion revokes the account's browsers and sessions, evicts the workspace instance, deletes the workspace directory, and deletes the platform rows, keeping only records the law requires for billing. Backups expire it within the backup retention (30 days), and the privacy policy must say so.

**Encryption at rest.** Encrypted volumes and backups; secrets envelope-encrypted (see Money). Per-workspace data keys, so that deleting a key destroys the data, are a later hardening.

**Documentation.** `docs/operations/data-and-state.md` gains the v3 layout and what each profile stores. `docs/architecture/platform.md` (new) records profiles, tenancy, identity and connect.

## Panel Customisation Extension Points

**Principles.**
- No fork. Core stays generic and domain-neutral.
- Data first, code second.
- Core enforces auth and permissions on every extension surface.
- The theme contract (`docs/architecture/ui-theme.md`) holds: products may set only a validated brand-accent subset of the semantic tokens, and registration checks contrast.
- Extensions are trusted host code, like today's host module. They are not a sandbox for untrusted packages.

**Registration point.**
- The host module gains an optional second export, `registerFluxIQPlatform(platform)`. It is called once per process, because `registerFluxIQHost(fluxiq)` runs once per workspace instance.
- Product, onboarding, settings, hooks and client IDs are registered there.
- Contracts live in `packages/contracts/src/platform/`. The registry lives in `packages/fluxiq/src/platform/panel/`, exported as `fluxiq/platform`.
- The unused `componentPacks` and `programExtensions` fields of `DomainRegistration` are deprecated in favour of this mechanism.

**Layer 1: the product manifest.** Data only, at runtime; zod schema `PanelProduct`.
- `id`, `name`, `shortName`;
- `assets`: logo, favicon and sign-in illustration, as file paths that Core serves at `/product/assets/<name>`;
- `brand`: an accent token subset;
- `links`: terms, privacy, support, docs, status;
- `auth`: login headline and body, provider order, sign-up blurb;
- `extensionStores`: store links per browser;
- `extensionClients`: `[{browser, extensionId}]`, which feeds the gateway Origin defaults;
- `email`: sender name and template overrides.

Server components read the manifest, so branding appears on first render with no flash. The client reads it from `GET /api/panel/product`. Without a product, the stock FluxIQ branding is used.

**Layer 2: declarative extensions.** Data, at runtime.
- `onboarding.steps[]`: id, title, markdown body, and an action (link, route, extension install, or connect browser). Each step has an optional server status check, a function registered in the platform hooks that returns done or not done.
- `settings.sections[]`: a schema of fields (toggle, select, text, list). Values are stored per workspace in a `panel.settings` repository kind. The domain runtime reads them through `fluxiq.panel.settings()`.
- `nav.items[]`: links to built-in or plugin routes.

**Layer 3: code plugins.** Build-time.
- `FLUXIQ_PANEL_PLUGINS=<package>[,...]` at `next build`. `apps/web/scripts/generate-panel-plugins.mjs` writes `apps/web/src/plugins/generated/registry.ts`, which imports each plugin's `panel` entry.
- Named slots, rendered by `apps/web/src/plugins/slot.tsx`: `auth.login.aside`, `onboarding.step`, `home.sections`, `settings.sections`, `workspace.sidebar`, `topbar.actions`, `account.sections`.
- Plugin pages are mounted at `/x/<pluginId>/[[...path]]` inside `AuthShell`, with Core's auth.
- Plugin API routes go through one catch-all, `apps/web/src/app/api/x/[pluginId]/[...path]/route.ts`. Handlers are registered server-side with declared permissions and run through `lib/operational-route-contract.ts`.
- Plugins import only `fluxiq/ui` and `fluxiq/platform`.
- The stock Core build has no plugins. Self-hosters with the stock image still get layers 1 and 2.

**Server hooks** (registered on `platform`; asynchronous and failure-isolated): `on('account.created' | 'workspace.created' | 'browser.connected' | 'browser.revoked' | 'usage.settled')`, `registerEmailTemplate`, `registerHumanCheck`, `registerBillingProvider`, `registerEntitlementPolicy`.

**What stays in Core:** the sign-in, sign-up, setup, consent, connect, account, browsers, usage, export and delete pages; the slot runtime and auth enforcement; discovery, the theme and the program policy.

**What lives downstream:** the product manifest and assets, the onboarding content, the web-automation settings sections, the extension client IDs, and any product-specific plugin pages. The paired document's "Product Panel Customisation" section lists them.

## Model Calls, Limits And Billing Hooks

**Key source.** A provider resolver chooses `byok` or `platform` according to profile and workspace.
- `platform`: the key is read at boot from `FLUXIQ_PLATFORM_DEEPSEEK_KEY_FILE`, a mounted secret. It is never stored in a database, never revealed, and never sent to the browser. The existing outbound check, which refuses a request body containing the key, stays.
- `byok`: today's Secret Keys.
  - Fix the selection bug in `programs/automation-studio/runtime/llm/deepseek/session-key.ts`: release the caller's own key or the Flow's `llmSecretKeyId`, never the first key of any user.
  - Under `multi`, and optionally under `self-hosted`, seal with a per-workspace data key wrapped by a master key from `FLUXIQ_MASTER_KEY_FILE`. OIDC users have no password to derive a key from, and builds must survive restarts.
  - Password sealing stays the `local` default.

**Usage meter.** A `UsageMeter` port fed by the build purse settlement ledger and the run budget (`programs/automation-studio/model/`). Each settled call records `{workspaceId, userId, flowId, runId, model, inputTokens, cachedTokens, outputTokens, costUsd, keySource, at}` in platform `usage.events`, with daily rollups, shown on `/account/usage`. Under `local` it is display-only.

**Limits** (defaults set by the user in Q3; enforced under `service`): the per-Flow purse (today $0.25); a daily and a monthly cap per workspace; a platform-wide daily ceiling, which alerts the operator and suspends platform-key calls until reset; one concurrent build per workspace; 60 model calls per minute per workspace; a verified email before any spend.

**Entitlement policy.** An `EntitlementPolicy` port, checked before a build starts and at the purse's pre-call check, returns allow, or deny with a reason the chat shows the user. Limits are budget-level only, with no per-call approval prompts, matching the standing rule that LLM calls need no execution grants.

**Billing.** A `BillingProvider` port (`createCheckout`, `handleWebhook`, `customerPortal`) over a credits ledger in the platform store. The closed beta grants credits without payment. A Stripe adapter comes later as an optional package (`@fluxiq/billing-stripe`), registered through `registerBillingProvider`.

**Abuse controls.** The human check on sign-up; limits per IP on sign-up and connect; an optional blocklist of disposable email domains; operator suspension of a workspace, which refuses its builds and model calls. The caps bound misuse of the chat as a free LLM.

## Deployment And Operations

Core ships generic packaging that serves both self-hosters and the owner's service. The paired document owns the hosted-service infrastructure and runbook.

**Image.** `deploy/docker/Dockerfile`: multi-stage on Node 22; builds native `sqlite3` for Linux; `next build` with `output: "standalone"` behind `FLUXIQ_WEB_STANDALONE=1`, so local development is unchanged; includes the gateway bundle and an optional host module path; runs as non-root with a read-only root filesystem except `/data` (`FLUXIQ_ROOT=/data`); `HEALTHCHECK` against `/api/health`.

**Example deployment.**
- `deploy/compose/self-hosted.compose.yml` and `deploy/caddy/Caddyfile.example`. Caddy handles automatic certificates, HSTS, `/client` WebSocket proxying and request size limits.
- `docs/operations/self-hosting.md` covers DNS, the first-run setup code, backups (a volume snapshot plus restic), upgrade and restore.

**Runtime support.** `/api/health` (liveness) and `/api/ready` (storage open, gateway listening); structured JSON logs to stdout, redacting tokens, cookies, codes, keys, request bodies and page data; an internal Prometheus metrics endpoint on the container network (sockets, builds, model calls and spend, errors, latency, disk); graceful drain; a `migrate` command run before start that takes a backup first. Migrations stay forward-only.

**Scaling model.** Vertical first: the server does model I/O, storage and authoring logic, while the browsers do the page work. Out by cells: each cell is a host owning a set of workspaces, a router pins a workspace to its cell for both HTTP and the socket, and the platform store moves to Postgres. Not before measured need; Phase 8's load test sets per-host capacity.

**CI.** Core's `.github/workflows/ci.yml` gains an image build and smoke (start the container, `/api/health`, discovery), the public-profile Playwright smoke, and a Trivy image scan. No deployment from Core, and no model calls in CI (`FLUXIQ_MODEL_PROVIDERS_ENABLED=false`).

## Security

**Assets:** accounts and sessions; connected-browser credentials, the highest value because they let the server drive a user's signed-in browser; workspace data (recordings, page content, screenshots, datasets); model keys and money.

**Actors:** anonymous internet users; a malicious tenant; a stolen device or credential; a hostile web page, through prompt injection; a malicious custom server a user was talked into adding; an operator insider; the supply chain.

**Top risks and mitigations.**

| # | Risk | Mitigation (phase) |
| --- | --- | --- |
| 1 | A compromised or buggy hosted server drives users' browsers | Browser-owner invariant in Core and the domain (P3). Consent-bound execution in the extension (paired document, D3). Permission gates for money, send and delete enforced in the browser. Visible activity overlay. Disconnect, and the operator kill switch |
| 2 | Cross-tenant leak | Workspace-per-root storage. Workspace resolved only from the session or credential. Per-workspace gateway. A route-matrix isolation test across every endpoint (P3) |
| 3 | Account takeover | Throttles per account and IP; TOTP; OIDC; session revocation; email on a new connected browser (P1, P4) |
| 4 | Connect-flow abuse (phishing, redirects, code theft) | PKCE S256; fixed same-origin redirect; single-use 120-second codes; `state`; typed codes never in links; consent screen with browser label (P2) |
| 5 | Public exposure of operator surfaces | Owner claim with setup code; program availability policy; fix the "check nothing" endpoints; hide absolute paths (P1, P3) |
| 6 | CSRF on cookie APIs | Origin and `Sec-Fetch-Site` middleware; `__Host-` cookie; SameSite=Lax (P1) |
| 7 | Denial of service | Frame, rate and pairing limits; session pruning; quotas; proxy limits; optionally Cloudflare in front (P1, P6) |
| 8 | Runaway model spend | Purse; workspace caps; platform ceiling with auto-suspend; alerts (P6) |
| 9 | Secret leakage | Platform key as a mounted file; envelope sealing; log redaction; Sentry scrubbing; no `.env` in images (P1, P6, P7) |
| 10 | Sensitive page data at rest | Extension-side screening before sending (paired document audit); encrypted volume and backups; retention; step logs off (P3, P7) |
| 11 | Server-side code execution | Host module and custom nodes are operator-only; custom nodes refused under `multi`; P3 audits the Flow DSL for any server-side evaluation |
| 12 | Supply chain | Lockfile; `pnpm audit` (exists); Dependabot; pinned base images; Trivy (P1, P7) |

**Secrets rules.** Production secrets (the platform model key, the master key, OIDC client secrets, the SMTP password, the Stripe key, the setup code) live only as mounted files or in the CI secret store, never in `.fluxiq`, the image, logs or the repository. `SECURITY.md` gains the hosted-mode boundaries above.

**Exposure gate.** No public profile may be exposed until the Phase 1 checklist, the route-matrix test, an OWASP ZAP baseline with no high findings, and the manual review checklist in `docs/operations/quality-and-security.md` (extended) all pass. An external penetration test is recommended before public launch (Q9).

## Testing

**Core unit and integration tests**, each in the `tests/` folder beside its subject:
- Identity: sign-up, verification and reset with the `file` email sender; an OIDC callback against a local stub provider; owner claim; throttles.
- Connect: authorize, token and revoke; PKCE vectors from RFC 7636; code reuse and expiry; the redirect rule and `state`; credential rotation, sliding expiry, the grace window and reuse revocation; typed-code alphabet, TTL and caps.
- Transport and tenancy: the Origin grammar, limits and drain; workspace manager lazy load, eviction and host module per instance; the browser-owner invariant in `selectSession`; the program policy.
- Money and discovery: the usage meter, caps and entitlements; the discovery schema.

**Route-matrix isolation test** (`apps/web/src/app/tests/`). It enumerates `GlobalProgramApiRegistry` and every app route, and with two workspaces calls each endpoint as workspace A against identifiers from workspace B, expecting a refusal or not-found. Any new endpoint fails until it is classified. This is the mechanical guard for tenancy.

**Core Playwright.** A new public-profile configuration, `apps/web/e2e/public-profile/`, whose harness starts the server under `service` behind Caddy `tls internal` on loopback. Journeys: the owner claim with the setup code, sign-up and verify, sign-in, the consent page, connected browsers, revoke. CI runs it as a smoke.

**Browser-level, Lab and staging coverage** is in the paired document. Live Lab runs stay on the ten realistic scenarios.

## Phases

Effort is in agent-days: one lane lead with workers, rough and unmeasured. Each phase merges as task branches, on narrow checks, per AGENTS.md. No hosted code merges before the MVP release on 2026-11-10.

| Phase | Goal | Depends on | Effort | Delivers |
| --- | --- | --- | --- | --- |
| P0 | Decisions and spikes S1-S4 | Open Questions | 3 | Settled choices, measured memory, call-site inventory |
| P1 | Public-ready server | P0 | 8-10 | Self-hosting on the web (today's pairing) |
| P2 | Extension sign-in protocol | P1 | 10-12 (with D2) | Sign-in in all three profiles |
| P3 | Tenancy | P0 S3/S4, P2 | 15-20 | `multi` with isolation |
| P4 | Hosted accounts | P1; P3 for the platform root | 8-10 | Sign-up, OIDC, reset, delete, export |
| P5 | Panel extension points | P1 | 8-10 | Product manifest, declarative layer, plugins, hooks |
| P6 | Money | P3 | 6-8 | Platform key, meter, caps, entitlement and billing ports |
| P7 | Operations packaging | P1 | 5-6 | Image, health, metrics, drain, migrate, self-host guide |
| P8 | Hardening and launch gate | P1-P7 | 6-8 | Route matrix green, load test, ZAP, review |

Parallel lanes once P2 lands: P3 runs alone in `apps/web/src/lib/workspaces` and the transport; P4 in identity-access; P5 in `apps/web/src/plugins` and `platform/panel`; P7 in `deploy/`. They touch disjoint files.

**P0 steps.** Briefs go into this document before dispatch. Nothing merges.
- S1 (paired with D0): extension-repo worktree only. Builds a stub `/connect/authorize` and done page, and tests tab observation in Chrome, Edge and Firefox.
- S2 (`deploy/` scratch): Caddy in front of `next start` and the gateway, carrying `wss` on the same origin.
- S3: a script that loads N workspace instances from copies of a seeded root and records heap size and start time.
- S4 (Explore): inventories every caller of the global instance (`apps/web/src/lib/fluxiq.ts` exports) and every module singleton.

**P1: public-ready server.** Ownership by step.
1. Profile resolution: `packages/fluxiq/src/platform/profile/` (new), read by `apps/web/src/lib/fluxiq.ts`.
2. Public origin and advertised `wss` URL; configurable gateway bundle path: `apps/web/src/lib/fluxiq.ts`, `src/server/gateway-runtime/load.ts`.
3. Origin grammar and gateway limits: `apps/web/src/server/client-gateway-websocket.ts`.
4. Pairing caps, crypto codes, session pruning, audit ring: `packages/fluxiq/src/client-gateway/service/{pairings,sessions,audit-log}.ts`.
5. Origin and Fetch-Metadata checks, `__Host-` cookie: `apps/web/src/middleware.ts` (new), `app/api/auth/login/route.ts`, `lib/auth.ts`.
6. Per-account and per-IP throttles, removing the global lockout: `apps/web/src/lib/login-attempts.ts`.
7. Owner claim and setup code: identity-access runtime, plus `apps/web/src/app/setup/` (new). Removes admin/admin.
8. Fix the "check nothing" endpoints (`database-manager`, `deployment-sync`, `identity-access` `revoke-session`, `secret-keys` `lock-vault`); hide absolute paths under public profiles.
9. Health and readiness, drain, structured logs: `apps/web/src/app/api/health/`, `src/server/`.
10. Discovery document (`/api/discovery` plus rewrite); contracts in `packages/contracts/src/platform/`.
11. Docs: `docs/integrations/client-gateway-websocket.md`, `docs/operations/self-hosting.md` (new), `SECURITY.md`.

Validation: unit tests beside each change; the S2 Caddy compose smoke (`wss` hello reaches `pairing_required`; Origin from a web page refused; an oversized frame closes the socket). Exit: a self-hosted server on a real domain pairs the current extension.

**P2: sign-in protocol** (with D2).
1. Contracts: `packages/contracts/src/platform/connect.ts`, `client-gateway.ts` 0.2.
2. Authorization codes and token exchange: `packages/fluxiq/src/platform/connect/` (new).
3. Connected-browser credentials: `client-gateway/service/trusted-clients.ts`, `lifecycle.ts`, `access.ts`.
4. Typed-code claim: `pairing-flow.ts`.
5. Pages `apps/web/src/app/connect/{authorize,done,page}`, and `account/browsers`.
6. Routes `apps/web/src/app/api/connect/{token,revoke,claim}`.
7. `server.revoked` and `server.going_away`.
8. Migration of trusted clients.
9. Docs: `docs/architecture/platform.md` (new).

Validation: the connect unit suite; the extension's D2 tests against a local server in each profile.

**P3: tenancy.**
1. `PlatformStore` and workspace registry: `packages/fluxiq/src/platform/workspaces/`.
2. Layout v3 under `multi`: `packages/fluxiq/src/framework/storage-layout.ts`.
3. Workspace manager and `workspaceFluxIQ(request)`: `apps/web/src/lib/workspaces/`, then route call sites in batches from the S4 inventory.
4. Gateway routing by credential.
5. Browser-owner invariant: `runtime/client-gateway-transport.ts`.
6. Per-workspace singletons.
7. Program policy and the operator command line.
8. Run deletion and retention task: `programs/automation-studio/storage/project/retention-store.ts` and background tasks.
9. Workspace export and import.
10. Route-matrix test.

Validation: route matrix green; the paired document's two-tenant Lab scenario.

**P4: hosted accounts.** Sign-up and verify, reset, `EmailSender`, `HumanCheck`, OIDC (Google), account deletion, platform root for identity under `multi`, and the `account/` pages. Owner: identity-access runtime and `apps/web/src/app/{signup,account}`. Validation: unit tests and the public-profile Playwright run.

**P5: panel extension points.**
1. Contracts and registry: `packages/contracts/src/platform/panel*.ts`, `packages/fluxiq/src/platform/panel/`.
2. `registerFluxIQPlatform`: `apps/web/src/lib/fluxiq.ts` host module loader.
3. Product assets route and branding in `layout.tsx` and `AuthShell.tsx`.
4. Onboarding and settings renderers: `apps/web/src/features/platform/`.
5. Plugin generator, slots, `/x` pages and `/api/x` routes: `apps/web/src/plugins/`, `app/x/`, `app/api/x/`.

Validation: a fixture product and a fixture plugin under `apps/web/src/plugins/tests/`; the theme contrast test.

**P6: money.** Platform key resolver, the session-key fix, envelope sealing (`programs/secret-keys/runtime/`), `UsageMeter` (`packages/fluxiq/src/platform/usage/`), caps and entitlement at the purse check, the credits ledger, the billing port, and `account/usage`. Validation: unit tests with a fake provider, and one supervised live Lab run on staging (paired document).

**P7: operations packaging.** Dockerfile, compose and Caddy examples, the metrics endpoint, the `migrate` command, the CI image job and scan, and the self-hosting guide. Validation: image smoke in CI.

**P8: launch gate.** Route matrix and ZAP baseline; the k6 load test of 1,000 simulated sockets (paired document); a review of the Security table; legal documents present (paired document). The user approves the beta.

**Fit with the MVP.**
- 2026-10-17 to 10-28: P0 alongside the MVP lanes. The MVP keeps priority.
- 10-29 to 11-10: freeze. Nothing hosted merges.
- From 11-11: P1, then P2. Self-hosting on the web, with sign-in, is ready around 11-28.
- P3 to P7 in parallel lanes.
- P8 and the closed beta in early January 2027.

## Risks

- **Per-workspace instance cost.** If S3 shows too much memory per loaded instance, eviction gets more aggressive, or the instance is split into a shared runtime plus per-workspace storage. The second is more invasive; it would re-plan P3.
- **Hidden globals.** Call sites or singletons may still assume one instance. S4 inventories them; the route matrix and the two-tenant Lab scenario catch the rest.
- **Hand-written authorization endpoints.** The scope is small: one public client kind, code plus PKCE. This needs RFC test vectors and a security review.
- **Long builds and deploys.** A restart cuts running builds. Drain mitigates it, and deploys must be announced.
- **DeepSeek as the only provider.** Data goes to a provider in China, which matters for the privacy policy and EU users (Q8).
- **Licence and legal.** A licensor entity, terms of service and a privacy policy are needed before taking users (Q9).
- **MVP contention.** Hosted work must not draw lanes away before 11-10.

## Work Ledger

### 2026-10-17 — Hosted production plan written
- Agent: lane lead hosted-production-planner
- Changed: created this document and the paired downstream document; no code, config or index edited
- Why: the user asked for a production plan (hosted service on their domain, login and connect via the website, panel customisation in the framework), with self-hosting kept first-class
- Validation: `node scripts/structure-audit.mjs` (Core) -> "1 violation(s) across 1 rule(s)": `[working-docs] docs/working/README.md is out of date`. The index row is left to the supervisor; there were no header, size or link findings for this document. The plan itself is not testable. Baseline claims re-read in code: `apps/web/package.json` (start binds 127.0.0.1), `client-gateway-websocket.ts:27-45` (non-loopback refusal, ws publicUrl), `runtime/client-gateway-transport.ts:98-107` (any-session fallback), `session-key.ts:33-43` (first enabled key), `api/contracts/project.ts:6-15` (no owner), `domains/index.ts:53-54`, `login/route.ts:116-122` (cookie flags)
- Outcome: Partial
- Follow-up: the user answers the Open Questions; the supervisor adds the index row and dispatches P0

## Open Questions

Owner: the user, for all of them. A recommendation follows each.

- **Q1. Is hosted mode part of the 2026-11-10 MVP?** Recommendation: no. Ship the MVP local-only, as planned. Deliver self-hosting on the web with sign-in about three weeks after, and a hosted closed beta in early January 2027.
- **Q2. Which domain, and which layout?** Recommendation: `app.<domain>` serves the panel, API and gateway; the apex serves the marketing site, terms and privacy; `status.<domain>` serves the status page. `getfluxiq.com` appears in `LICENSE.md`. Is that the domain?
- **Q3. Who pays for model calls in the hosted service, and what are the caps?** Recommendation: a platform key, with free monthly credit during the beta (for example $2 a month per workspace), a daily cap per workspace, and a platform daily ceiling (for example $20) that suspends and alerts. Bring-your-own-key stays optional.
- **Q4. Payments at launch?** Recommendation: none in the closed beta, which is invite-only with free credits. Stripe through the billing port before public launch.
- **Q5. Sign-in providers?** Recommendation: email and password plus Google at launch; GitHub and Microsoft later; generic OIDC for self-hosters.
- **Q6. Teams and shared workspaces?** Recommendation: personal workspaces only, with the membership table in place from the start.
- **Q7. Hosting provider and region?** Recommendation: one VM (Hetzner or DigitalOcean, 4 vCPU and 16 GB) running Docker Compose, in the region of most expected users. No Kubernetes and no serverless.
- **Q8. Is DeepSeek, with processing in China, acceptable for hosted users?** Recommendation: launch with explicit disclosure, and plan a second provider adapter as a Core follow-up.
- **Q9. Licensor entity, terms of service and penetration test?** Recommendation: settle the licensor entity and draft the terms and the hosted privacy policy before the beta, with a legal review and an external penetration test before public launch. Self-hosters running `multi` for third parties still need a commercial licence, and the self-hosting guide should say so.
- **Q10. Operator console?** Recommendation: launch with an operator command line (suspend, revoke all, reset caps). Add an admin page after the beta.
