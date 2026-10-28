# Hosted Production Plan

Status: Active
Status detail: Revised 2026-10-28 around the user's 2026-10-18 directions (FluxIQWebsite is the public site, local simulation first, IAM-style permissions with tenancy as an enterprise feature, a re-cut schedule); plan only, no code changed; H0 can start now.
Created: 2026-10-17
Last updated: 2026-10-28
Owner: Lane lead hosted-production-planner (plan); the senior supervisor agent owns execution
Scope: Core side of running FluxIQ in production as one codebase with three deployments (getfluxiq.com, local, self-hosted): identity and account provisioning, IAM-style permissions on every surface, extension sign-in, gateway transport, tenancy and storage, panel extension points, bring-your-own-key model calls, deployment, security, tests, release cut. Browser, store, website, local simulation and Lab work is in the paired document.
Paired document: C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/docs/working/hosted-production-plan.md
Related: [package boundaries](../architecture/package-boundaries.md), [current system](../architecture/current-system.md), [client gateway](../integrations/client-gateway-websocket.md), [data and state](../operations/data-and-state.md), [quality and security](../operations/quality-and-security.md), [ui theme](../architecture/ui-theme.md), [MVP final month](./mvp-final-month-plan.md), [working index](./README.md)

---

## Current State

**What is true now.** This is a plan. No hosted code exists yet: on 2026-10-28 Core has no
`packages/fluxiq/src/platform/`, no `packages/contracts/src/platform/`, no `FLUXIQ_PROFILE`, no
provisioning and no Dockerfile. The baseline below was re-checked in the code on 2026-10-28.

**The user's directions of 2026-10-18 are folded in** (each is the user's own instruction):
1. **The public site is the user's repository, FluxIQWebsite** (github.com/aidens113/FluxIQWebsite,
   live at getfluxiq.com). It is a Next.js 16 static export on Hostinger with no server and no
   accounts. It gains sign-up and a small sign-up backend; Core keeps sign-in, connect and the
   panel on `app.getfluxiq.com`. The earlier "product site as a Core plugin" idea is dropped for
   public pages (see Target Topology). Details of the website side are in the paired document.
2. **The website side is simulated locally first,** in a stand-in that the paired document
   specifies. Core's part is the same in both: the provisioning listener and the welcome link.
3. **Permissions follow AWS IAM** (see Permissions). Principals, named resources, per-type
   actions, allow and deny policies with conditions, explicit deny wins, default deny, groups and
   roles, and an audit of every decision. The old `admin`, `viewer` and `user` roles become
   predefined policies. Single-owner local and self-hosted keep working through
   `FluxIQOwnerFullAccess`. Shared workspaces with separated workers are an enterprise feature;
   Core stays freemium.
4. **The schedule is re-cut into parallel lanes** with the constraint behind each date named.
   Store submission moves from about 12-01 to about 11-13.

**User decisions** (2026-10-17, 10-18, 10-27):
- **Self-hosting stays first-class (binding).** Three deployments, one codebase; the extension
  connects to any of them. Single-user self-hosting needs none of the multi-user machinery.
- **Hosted ships with the Chrome Web Store release,** built into Core directly.
- **getfluxiq.com runs on Core as its control panel.** The website's backend provisions users into
  Core; each user reaches only the data their permissions allow, never admin or database access.
- **Bring your own provider key,** stored securely, never visible to others or in logs. No
  platform key; billing stays a port.
- **No company exists yet;** only launch prerequisites need one. **Optional cookies are declined
  by default** (separate work). **No feature freeze** (user, 2026-10-27).

**Recommended architecture.** One image, three profiles (`FLUXIQ_PROFILE=local|self-hosted|service`).
`getfluxiq.com` serves FluxIQWebsite; `app.getfluxiq.com` serves Core (sign-in, welcome, connect,
panel, API, discovery, `/client`). The website backend calls `platform.provisioning` on a private
listener reachable only inside the VM's network, and never handles a password: Core's welcome link
verifies the email and sets it. One IAM evaluator sits behind the program API registry (289
endpoints), the 15 app routes, plugin routes and the gateway, and every decision is audited.
Workspace-per-root tenancy under `service`; extension sign-in by code plus PKCE in a normal tab;
keys sealed under the user's password; billing and entitlement are ports.

**Contract ownership.** Here: discovery, connect and the browser credential, gateway 0.2,
provisioning and its listener, IAM, profiles and tenancy, panel extension points, billing and
entitlement ports. Paired: the extension, stores, consent, the website and its stand-in,
infrastructure, user docs, privacy, legal, Lab.

**Schedule** (today 10-28; the MVP deadline is 11-10; details in Phases And Release Cut).
- 10-28 to 10-30: H0 spikes S1 to S6 and the contract freeze, in parallel.
- 10-30 to 11-08: eight Core lanes and the paired lanes in parallel. Core lanes merge to `dev`
  as each is green, guarded by the IAM parity test; the extension's connection files merge on
  11-10, when the MVP live lanes release them.
- 11-11 to 11-12: the hosted gate on staging. About 11-13: Chrome Web Store submission.
- Public: when Google approves. Google states most reviews finish "within a few days, but it can
  take up to a few weeks", and `<all_urls>` draws extra scrutiny.

**Next.**
1. The supervisor dispatches H0 (S1 to S6) and the contract-freeze worker, and opens the paired
   H1 task (one ID, nested worktrees).
2. The user answers N1 to N6, and creates the VM, DNS and store developer account (paired U9).

**Blocked.** Nothing blocks H0 or H1.

**Not verified.** Tab-flow observation in Edge and the Firefox popup (S1); memory per workspace
instance (S3); how an extension-started build finds an unlocked key session (S5); the volume of
auditing every decision and the cost of list filtering (S6); whether Next.js serves `/.well-known`
directly (a rewrite is planned); when the store assigns the item ID (believed: first draft upload).

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
  pairings.
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
  `automationStudioContexts`.
- **Storage.** Node `sqlite3`: `global.sqlite`, per-domain and per-project databases (26
  forward-only migrations). SQLite-specific SQL; in-process locks. `Repository<T>` is the only
  backend-neutral interface.
- **Secrets.** AES-256-GCM sealed under the creator's password-derived key; unlocks held per
  login session (`held-keys.ts`). `releaseAutomationStudioSessionDeepSeekKey`
  (`runtime/llm/deepseek/session-key.ts:33-43`) takes the first enabled DeepSeek key of anyone.
- **Model spend.** DeepSeek only; per-run ceiling $0.25 (max $10), per-Flow purse, 250-call backstop.
- **Retention and export.** Projects and recordings deletable; runs not. The retention store
  is unused. Only datasets and run audits export.
- **Domain hooks.** Synchronous `registerFluxIQHost(fluxiq)` from `FLUXIQ_HOST_MODULE`, per
  instance. `componentPacks` and `programExtensions` unused (`domains/index.ts:53-54`).
- **Operator-only surfaces.** Deployment Sync, Database Manager, root Docs, Status paths; the
  "check nothing" endpoints in `package-boundaries.md`.
- **Hosting.** No Dockerfile, TLS or proxy support. Licence: Sustainable Use License.

## Target Topology

```
 user's browser                 one VM, Docker Compose, Caddy terminating TLS
 +----------------------+       +-----------------------------------------------------+
 | getfluxiq.com tab    | https | getfluxiq.com  -> website (FluxIQWebsite image):     |
 |  marketing, sign-up  | ----> |   static pages + POST /api/signup                    |
 +----------------------+       |        | provisioning over the internal network only |
 +----------------------+       |        v (token, source allowlist; never public)     |
 | app.getfluxiq.com tab| https | app.getfluxiq.com -> Core (product image):           |
 |  sign-in, welcome,   | ----> |   panel, API, /connect, /.well-known/fluxiq          |
 |  connect, Flows      |       |   /client -> client gateway                          |
 +----------------------+       |   platform layer: accounts, IAM, workspaces, browsers|
 +----------------------+  wss  |   workspace manager: one instance per active root    |
 | FluxIQ extension     | ----> |   model calls -> provider, with the user's own key   |
 +----------------------+       +-----------------------------------------------------+
```

**Decision: the website and Core are two services on two hostnames of one domain.** This
replaces the earlier one-origin plan (old N2), because the public site is the user's own
repository, a separate Next.js 16 app, while Core's panel is Next.js 15 with routes at the root.

| Option | Verdict | Why |
| --- | --- | --- |
| Website pages as a Core layer-3 plugin, one origin | Dropped | Duplicates the user's site; two copies of the brand and legal pages |
| Website and Core on one origin, split by path | Rejected | Core's routes sit at `/` (`/api`, `/connect`, `/x`); a `basePath` touches every route and the gateway; path collisions |
| **Website on `getfluxiq.com`, Core on `app.getfluxiq.com`** (chosen) | Recommended | No Core routing change; the session cookie and the `/connect/done` page live on an origin that loads no analytics or third-party script; no session handoff, because nobody signs in on the website |
| Website stays on Hostinger, calls Core across the internet | Rejected | The provisioning endpoint would be reachable from the internet |

**Division of work.** The server runs the panel, API, gateway, platform layer, Flow logic, model
calls, storage and background tasks. The extension runs page observation, every page action,
recording, the chat, sensitive-field screening and the prompts for lasting acts. The server never
runs a browser.

**Tenancy.** One process, workspace-per-root, lazily loaded. Rejected alternatives stay rejected:
an instance per user (cold starts, orchestration), a shared Postgres schema (rewrite, missed
filters leak), serverless (the long-lived gateway socket and native `sqlite3`).

**Profiles.** `FLUXIQ_PROFILE` sets defaults; each line can be overridden.

| Setting | `local` (today) | `self-hosted` | `service` (getfluxiq.com) |
| --- | --- | --- | --- |
| Public origin | `http://127.0.0.1:3000` | `https://fluxiq.example.org` | `https://app.getfluxiq.com` |
| Gateway advertised | `ws://127.0.0.1:4777/client` | `wss://<origin>/client` | `wss://app.getfluxiq.com/client` |
| TLS | none | Caddy | Caddy |
| Tenancy | `single` | `single` (`multi` is enterprise) | `multi` |
| Accounts created by | owner claim | owner claim, then admin | website backend over the private provisioning listener |
| Default policies | owner: `FluxIQOwnerFullAccess` | owner: `FluxIQOwnerFullAccess`; others: `FluxIQAdministratorAccess` or `FluxIQReadOnlyAccess` | each sign-up: `FluxIQUserAccess` in a personal workspace; guardrail `FluxIQServiceGuardrail` |
| Enterprise IAM (groups, custom policies, roles, separated workers) | n/a | entitlement-gated | entitlement-gated, per organisation workspace |
| Identity providers | password | password; OIDC later | password; Google later (Q5) |
| Email sender | none | optional SMTP | required (welcome, reset) |
| Connect flows | tab, typed code, one-click on loopback | tab, typed code | tab, typed code |
| Model key | user's own | user's own | user's own; no platform key |
| Operator programs | on for owner | on for owner | denied by guardrail; command line only |
| LLM step logs | opt-in | opt-in | off |

**Identical in all three:** the extension and its sign-in, discovery, the gateway protocol, the
provisioning functions, the IAM evaluator, workspace contents and storage, the host module, the
panel extension points, the build loop and the export format. **Single tenancy carries no
multi-user machinery:** one workspace, no layout change, no provisioning listener, no email
requirement, no billing.

## Identity And Sessions

**Core owns identity by extending identity-access.** A managed IdP would split self-hosted and
hosted code; it can plug in later through generic OIDC.

**Providers port** (`programs/identity-access/runtime/providers/`): `password` (the only provider
at launch); `oidc` (H2, a reviewed library such as `openid-client`; Google first). OIDC users have
no password to seal keys with; the H2 browser-held unwrap key covers this.

**Account record.** Gains `email`, `emailVerifiedAt`, `displayName`, `externalId`,
`identities[]`, `status` (active, disabled, deleted), `createdVia`, `termsVersion`. `roleId` is
replaced by membership policy attachments (see Permissions); a migration maps `admin` to
`FluxIQAdministratorAccess` and `viewer` to `FluxIQReadOnlyAccess`.

**Membership.** `workspace.members {workspaceId, userId, policies[], groups[], status}`. Under
single tenancy the one workspace's members are today's users. The platform operator
(`platform-admin`) is a command-line principal only; provisioning can never create or attach it.

**Welcome, verification and recovery.**
- **Welcome link** (new; every account created over the private listener): one link that verifies
  the email, sets the password and signs the user in at `app.getfluxiq.com/welcome`. Token: 32
  bytes, single use, 24 hours, stored hashed, in the URL fragment, posted by the page. A
  `continueUrl` recorded at creation is honoured only as a same-origin path under
  `/connect/authorize`, so a sign-up started from the extension returns to consent.
- Reset (`apps/web/src/app/api/auth/`); an `EmailSender` port (`none`, `smtp`, `file`); a
  `HumanCheck` port (no-op or Turnstile) for Core's own public forms. Under `service`, a verified
  email is required before connecting a browser or building. A reset leaves keys sealed under the
  old password unreadable, and the reset page says so.
- **Anti-enumeration.** An existing email returns `exists` to the caller only; Core mails the
  address "you already have an account", and the website shows "check your email" either way.

**Owner claim replaces admin/admin.** `local`: the first loopback visit creates the owner.
`self-hosted` and `service`: a one-time setup code printed at first boot (or
`FLUXIQ_SETUP_CODE_FILE`) unlocks `/setup`. Under `service` the claimed owner administers the
platform root, not a tenant workspace. Every path ends in `platform.provisioning.createAccount`
and attaches `FluxIQOwnerFullAccess`.

**Sessions.** Opaque IDs stored as digests. On an `https` public origin the cookie is
`__Host-fluxiq_session` (Secure, HttpOnly, SameSite=Lax, Path=/); on an `http` loopback origin
it stays `fluxiq_session`. Strictly necessary; Core sets no optional cookies. 12-hour idle TTL;
"keep me signed in" gives 30 days, sliding, under `service`. Destructive acts need
re-authentication (password for accounts without a PIN). A password change revokes other sessions
and offers to revoke browsers.

**Throttling.** Sliding windows per account and per IP (proxy IP only with
`FLUXIQ_TRUST_PROXY`), stored in the platform store. The global 100-failure lockout is removed,
since it lets anyone lock out everyone; an anomaly alert replaces it.

## Account Provisioning API

Schema `packages/contracts/src/platform/provisioning.ts` (zod); implementation
`packages/fluxiq/src/platform/provisioning/`.

**The provisioner is an IAM service identity.** Whatever the transport, the caller is
`frn:fluxiq:iam::service-identity/<name>` with the predefined policy `FluxIQProvisioner`: it
allows the `platform:*Account*` actions below and explicitly denies every workspace content
action (`studio:*`, `secrets:*`, `gateway:*`) and any attachment of a policy outside the
predefined user-level set. Explicit deny wins, so no later policy edit can widen it. The
capability object still exposes only the operations below (defence in depth).

**Transports.**
- **Private HTTP listener** (getfluxiq.com and the local stand-in): a separate `node:http`
  listener (`FLUXIQ_PROVISIONING_LISTEN`, for example `0.0.0.0:4780` inside the Compose network),
  never mapped to a host port or routed by Caddy; `POST /provisioning/<operation>`. Bearer token
  from `FLUXIQ_PROVISIONING_TOKEN_FILE` (32 bytes, stored as SHA-256, two active for rotation);
  source allowlist `FLUXIQ_PROVISIONING_ALLOWED_CIDRS` (default loopback and private ranges);
  rate limit; no cookie, no CORS; bodies never logged. Off unless the token file is set.
- **In-process** (`registerFluxIQPlatform(platform)` receives `platform.provisioning`): the owner
  claim, the admin "add user" form and plugin server entries.
- **Operator command line.** `fluxiq accounts <operation>` on the host, as `platform-admin`.

Every operation is idempotent by `requestId`, is itself an audited IAM decision, and returns
typed errors: `email_taken` (in-process only), `weak_password`, `not_found`, `disabled`,
`forbidden_policy`.

| Operation | Input | Effect |
| --- | --- | --- |
| `createAccount` | `requestId`, `email`, `displayName`, `password?` (in-process only), `externalId?`, `policies` (predefined names), `workspace: "new" \| workspaceId`, `termsVersion?`, `continueUrl?`, `sendWelcome?` | Creates the user (or reports `exists`). `"new"` creates a personal workspace and fires `workspace.created`. With `sendWelcome`, emails the welcome link. Returns `{status, userId?, workspaceId?}`; over HTTP, `userId` is returned only for `created` |
| `sendWelcome` | `userId` or `email`, `continueUrl?` | Re-sends the welcome link (the website's "resend" button); answers the same whether or not the email exists |
| `setPassword` | `userId`, `password` | In-process only; hashed at once; other sessions revoked |
| `setPolicies` | `userId`, `workspaceId`, `policies` | Predefined user-level policies only; `FluxIQOwnerFullAccess` only in single tenancy; anything granting `platform:*` is `forbidden_policy` |
| `addMember` | `userId`, `workspaceId`, `policies` | Enterprise organisation workspaces; entitlement-checked |
| `disableAccount`, `enableAccount` | `userId`, `reason` | Disable refuses sign-in, revokes sessions and browsers, sends `server.revoked` |
| `deleteAccount` | `userId`, `mode: "scheduled" \| "immediate"` | Revokes, evicts and deletes the personal workspace, removes platform rows, returns a receipt |
| `rotateCredentials` | `userId`, `scope: "sessions" \| "browsers" \| "password" \| "all"` | Revokes; `password` sends a reset link |
| `getAccount` | `userId \| email \| externalId` | `{userId, email, status, workspaceIds, createdAt, lastSignInAt}`; never hashes, keys, policies' contents or workspace content |

**Passwords.** Over HTTP, passwords never travel: the user sets one through the welcome link on
Core's origin. In-process callers pass it once. Passwords never reach logs, the audit or errors.

**Single-user and self-hosted.** The owner claim calls `createAccount({policies:
["FluxIQOwnerFullAccess"], workspace: <the only workspace>})`; "add user" calls the same function
with `FluxIQAdministratorAccess` or `FluxIQReadOnlyAccess`. The listener stays off.

## Permissions (IAM Model)

**Decision: an IAM-shaped policy model with Core's own evaluator.** Policies are JSON documents
in the shape enterprise administrators already know from AWS IAM. AWS Cedar was considered and
not chosen: it is a different policy language from the one the user asked for, and adds a WASM
dependency. The evaluator is small, pure and table-tested against IAM semantics.

**Principals** (`frn:fluxiq:iam:<workspaceId>:<type>/<id>`).
- `user/<userId>`: a person's membership in a workspace.
- `group/<name>`: a set of users; policies attach to it. Not a principal that acts.
- `role/<name>`: an identity with a trust policy saying who may assume it; assuming it yields a
  temporary role session with the role's policies.
- `service-identity/<name>`: a non-human caller. Platform-level ones (no workspace) include the
  website's provisioner. Workspace-level ones (enterprise) cover API clients.
- **Browser sessions:** a connected browser acts as its user, narrowed by the session policy
  `FluxIQBrowserSession` (AWS session-policy semantics).
- `platform-admin`: the operator, command line only.

**Resources** (FluxIQ Resource Names, `frn:fluxiq:<service>:<workspaceId>:<type>/<path>`).
- `studio`: `project/<id>`, `project/<id>/flow/<id>`, `.../recording/<id>`, `.../run/<id>`,
  `.../dataset/<id>`, `schedule/<id>`.
- `secrets`: `key/<id>`. `gateway`: `browser/<connectedBrowserId>`.
- `iam`: `user/<id>`, `group/<name>`, `role/<name>`, `policy/<name>`, `service-identity/<name>`.
- `ops`: `program/<programId>` for operator programs (Database Manager, Deployment Sync, Compute
  Control, root Docs, framework setup and migrate).
- `platform`: `frn:fluxiq:platform::account/<id>` and `workspace/<id>` (no workspace segment).
- **Ownership.** Projects gain `ownerUserId` (migration: the workspace owner, or the first
  `admin`). Children evaluate against their project's owner. Keys are owned by their creator
  (they are sealed under the creator's password anyway); browsers by their user.

**Actions** (`<service>:<Action>`), one per program endpoint and app route, generated
mechanically: program id maps to a service prefix (`automation-studio` to `studio`,
`secret-keys` to `secrets`, `identity-access` to `iam`, `client-gateway` to `gateway`, operator
programs to `ops`), and the endpoint name becomes PascalCase (`create-project` to
`studio:CreateProject`). Each registration gains `resource` (a function from the request payload
to one or more FRNs, or the parent for creates and lists) and `accessLevel`
(`List | Read | Write | PermissionsManagement`, derived from `classification` and overridable).
The generated catalog `packages/contracts/src/iam/actions.generated.ts` is checked in; a check
fails on drift and on any endpoint without an action and resource.

**Policy grammar** (`packages/contracts/src/iam/policy.ts`). `{Version, Id, Statement[]}`; each
statement has `Sid`, `Effect` (`Allow | Deny`), `Action` or `NotAction`, `Resource` or
`NotResource` (with `*` and `?` wildcards), and an optional `Condition`. Operators at launch:
`StringEquals`, `StringNotEquals`, `StringLike`, `Bool`, `IpAddress`, `NotIpAddress`,
`DateLessThan`, `DateGreaterThan`, with the `IfExists` suffix. Policy variables: `${fluxiq:PrincipalId}`,
`${fluxiq:WorkspaceId}`. Condition keys: `fluxiq:PrincipalId`, `fluxiq:PrincipalType`,
`fluxiq:WorkspaceId`, `fluxiq:ResourceOwner`, `fluxiq:ResourceTag/<key>`,
`fluxiq:RequestOrigin` (`panel | extension-chat | schedule | api | provisioning | cli`),
`fluxiq:ConnectedBrowserId`, `fluxiq:SourceIp`, `fluxiq:MfaPresent`, `fluxiq:Profile`,
`fluxiq:CurrentTime`.

**Policy kinds.**
- **Identity policies,** managed (predefined by FluxIQ, or customer-managed) or inline, attached
  to users, groups, roles and service identities.
- **Guardrails** (the analogue of AWS service control policies): deny-only, set by the profile
  or an organisation, apply to every principal in the workspace.
- **Session policies:** `FluxIQBrowserSession` for browsers; an optional one when assuming a role.
- **Permission boundaries** (enterprise): the most an organisation's delegated admins can grant.
- Resource-based policies and cross-workspace sharing are out of scope until teams need them.

**Evaluation** (`packages/fluxiq/src/platform/iam/evaluate/`), pure and deterministic:
1. Gather the applicable statements: identity (direct, via groups, via the assumed role),
   guardrails, the session policy and the boundary.
2. Any matching explicit `Deny` in any of them denies.
3. Otherwise allow only when an identity statement allows **and** the session policy (if any)
   allows **and** the boundary (if any) allows.
4. Otherwise deny (implicit). Least privilege is the default: a new principal can do nothing.

Policies compile once per principal per request (wildcards to anchored patterns, variables
bound). A compiled policy set that contains an unconditional `Allow *` with no `Deny` marks the
principal as full-access, so single-owner list endpoints skip per-item checks and local
performance does not change.

**Predefined policies** (`packages/fluxiq/src/platform/iam/predefined/`, versioned, read-only).

| Policy | Grants | Replaces |
| --- | --- | --- |
| `FluxIQOwnerFullAccess` | `*` on `frn:fluxiq:*:${fluxiq:WorkspaceId}:*` | the single owner's implicit everything |
| `FluxIQAdministratorAccess` | every action today's `admin` role reaches, in the workspace | `admin` |
| `FluxIQReadOnlyAccess` | every action whose endpoint required `programs.read` | `viewer` |
| `FluxIQUserAccess` | `studio:*` and `secrets:*` and `gateway:*` on resources whose `fluxiq:ResourceOwner` is `${fluxiq:PrincipalId}`; create and list in the workspace; `iam:` self-service on `user/${fluxiq:PrincipalId}` (password, sessions, browsers, deletion request) | `user` (the own-data rule) |
| `FluxIQBrowserSession` (session) | gateway connect, Studio read, write and run; never `iam:*`, key reveal or destructive actions | the browser credential's fixed scope |
| `FluxIQProvisioner` | the provisioning actions; denies all workspace content | the provisioner rules |
| `FluxIQServiceGuardrail` (guardrail) | denies `ops:*`, custom-node registration, framework setup and migrate, `platform:*` | the program availability policy |

**The own-data rule** is now `FluxIQUserAccess` plus the guardrail. In a personal workspace the
user owns every resource, so it grants their own data and nothing else exists to reach. In an
organisation workspace the same policy keeps a worker to their own projects, keys and browsers
unless an admin attaches more (for example a group policy allowing `studio:Read*` on
`project/*` tagged `team=sales`). The browser-owner invariant stays a hard rule in the gateway as
well as a policy condition: a browser executes only its own user's runs, whatever a policy says.

**Enforcement points** (all through `authorize(principal, action, resources, context)` in
`packages/fluxiq/src/platform/iam/`):
- `GlobalProgramApiRegistry.call` replaces the `permissions.includes` check; the PIN check for
  destructive endpoints stays as it is.
- The 15 app routes, through `lib/program-route.ts` and `lib/operational-route-contract.ts`.
- Plugin routes (`app/api/x/`), the gateway (hello, command dispatch, Bearer HTTP) and the
  provisioning listener.
- **List endpoints** filter items by the item's `Read` action (full-access fast path above).
- Under public profiles an endpoint with no action and resource is refused at startup.

**Audit of every decision.** Each decision, allow or deny, is recorded:
`{time, requestId, principal, action, resources, decision, matched {policy, sid} | "implicit",
origin, ipPrefix}`. Per-workspace table in the workspace root; platform decisions in the platform
store. IAM changes and denies are kept 1 year; allows 90 days under `service` (S6 measures volume
from panel polling first). A user sees decisions about their own principal; a workspace admin
sees the workspace; the operator uses the command line. Enterprise adds export and a policy
simulator.

**Parity, the mechanical guarantee.** A generated test walks all 289 registrations and the 15
routes and asserts that `FluxIQAdministratorAccess` and `FluxIQReadOnlyAccess` allow exactly
what `admin` and `viewer` allow today. It makes the IAM switch provably inert for local and
self-hosted, which is what lets it merge before 11-10.

**Freemium and enterprise.** Free in every profile: the single owner, today's multi-user
self-hosting with the predefined Administrator and ReadOnly policies (N5), and a personal
getfluxiq.com workspace. Enterprise: organisation workspaces whose members are separated by
policy, groups, customer-managed policies, roles, permission boundaries, SSO, decision export and
the simulator. They are gated by the `EntitlementPolicy` port (`feature: "iam.organisation"`,
`"iam.customPolicies"`, `"iam.roles"`, `"iam.sso"`, `"iam.auditExport"`): on getfluxiq.com by
plan through the billing port, on self-hosted by a signed entitlement file (N6). The evaluator
itself is never gated.

## Extension Client Sign-In Protocol

Owned here; the paired document owns the browser-side client.

**Discovery.** `GET /.well-known/fluxiq` rewritten (`next.config.ts`) to `/api/discovery`; schema
`packages/contracts/src/platform/discovery.ts`; no secrets; cacheable 5 minutes.

```json
{ "fluxiqDiscoveryVersion": 1,
  "instance": { "name": "FluxIQ", "profile": "service", "product": { "name": "FluxIQ", "logoUrl": "/product/assets/logo.svg" } },
  "origin": "https://app.getfluxiq.com", "gatewayUrl": "wss://app.getfluxiq.com/client",
  "connect": { "authorizeUrl": "/connect/authorize", "tokenUrl": "/api/connect/token",
               "revokeUrl": "/api/connect/revoke", "codeEntryUrl": "/connect",
               "signUpUrl": "https://getfluxiq.com/signup/" },
  "protocols": { "clientGateway": ["0.1", "0.2"] },
  "minimumClient": { "browser-extension": "0.2.0" } }
```

`signUpUrl` may be absolute (it must be `https`, or `http` on loopback); the other URLs are
same-origin paths. It comes from the product manifest.

**Flow A, primary: authorization code with PKCE in a normal tab** (RFC 8252, RFC 7636; one public
client kind).
1. The extension fetches discovery and creates a 32-byte `code_verifier`, the S256 challenge, a
   `state` and a `client_install_id` for this server.
2. It opens `/connect/authorize?client_id=fluxiq-browser-extension&redirect_uri=<origin>/connect/done&code_challenge=..&code_challenge_method=S256&state=..&client_install_id=..&client_label=..`.
3. Signed out, the page asks the user to sign in, with "Create an account" linking to
   `signUpUrl?continue=<this authorize URL>`. After the welcome link the user returns here.
4. Consent shows the browser label, the workspace and "can run your automations in this browser".
5. The server issues a code (32 bytes, single use, 120-second TTL, bound to challenge, install
   ID, user, workspace and approving session) and redirects to `/connect/done#code=..&state=..`.
   That page sends `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, loads no
   third-party resource and never shows the code. No analytics runs on `app.getfluxiq.com`.
6. The extension accepts the URL only from its own tab, exact origin, matching `state`; closes the
   tab; POSTs the token URL with `code`, `code_verifier`, `redirect_uri`, `client_id`,
   `client_install_id`.
7. Response `{credential, credentialExpiresAt, connectedBrowserId, user, workspace, gatewayUrl}`;
   the extension connects with `client.hello.token = credential`.

Not `identity.launchWebAuthFlow`: no extension IDs to register, no `identity` permission, no
second cookie store, and Playwright can drive a normal tab. A crafted link gains an attacker
nothing: only the extension holding the verifier can exchange the code.

**Flow B, fallback: a typed code.** A hello without a credential gets `server.pairing_required
{referenceCode, codeEntryUrl}`. Eight characters from a crypto RNG, no ambiguous characters,
10-minute TTL, typed at `/connect` by the signed-in user, never in links. Binds to the approver's
workspace. At most 5 pending per IP, 1,000 total. `local` keeps one-click approval on loopback.

**Connected-browser credential** (evolves `client-gateway/service/trusted-clients.ts`).
- Fields: `connectedBrowserId`, `userId`, `workspaceId`, `clientId`, `domainId`, `label`,
  `browser`, `os`, `createdAt`, `lastSeenAt`, `lastIpPrefix`, `credentialHash`,
  `previousCredentialHash`, `previousValidUntil`, `expiresAt`, `revokedAt`, `revocationReason`,
  `approvingSessionId`.
- Rotates on every connect (sliding 60 days); the previous one stays valid once for 2 minutes.
  Presenting an older one revokes the browser, audits it and emails the owner.
- Acts as its user under the session policy `FluxIQBrowserSession`; Bearer valid only while the
  socket is ready on this host. At most 10 browsers per account under `service`.

**Revocation.** `/account/browsers` (one or all); a password change (optional); provisioning
(`disableAccount`, `rotateCredentials`, `deleteAccount`); the operator kill switch
`revoke-all-browser-credentials`. Live sockets receive `server.revoked {reason}`.

**Client gateway 0.2** (additive; `packages/contracts/src/client-gateway.ts`,
`service/protocol-version.ts`): `server.revoked {reason}`; `server.going_away {reason,
retryAfterMs}`; `session_ready` gains `user`, `workspace`, `credentialExpiresAt`;
`pairing_required` gains `codeEntryUrl`; hello metadata gains `clientLabel`; every action command
gains `runContext {runId, actorUserId, workspaceId, origin, startedFromSessionId}`.

**Migration.** Under single tenancy, trusted clients become browsers of their approver. Legacy
tokens keep working on loopback for two releases. Public profiles accept only user-bound
credentials.

## Gateway Transport Over The Internet

- **Same origin as the panel.** Caddy routes `app.getfluxiq.com/client` to the gateway; one
  certificate, port 443 only; the gateway stays plain `ws` behind it.
  `FLUXIQ_PUBLIC_CLIENT_WS_URL` becomes authoritative for status and discovery (`lib/fluxiq.ts`);
  the bundle path in `gateway-runtime/load.ts` becomes configurable.
- **Origin rule** (`client-gateway-websocket.ts`): exact origins, `chrome-extension://<id>`
  (Chrome and Edge IDs differ), `moz-extension://*`. Other web origins and `*` refused; a missing
  Origin is allowed (the credential authenticates). Public profiles default to the product's
  extension IDs plus `moz-extension://*`.
- **Limits** (configurable, with metrics): 16 MiB frames; hello within 10 seconds; 50 messages per
  second, bursts of 200; ended sessions pruned; an audit ring of 10,000 per workspace with
  security events persisted; pending pairings capped as in Flow B.
- **Client IP** from `X-Forwarded-For` only with `FLUXIQ_TRUST_PROXY`; audited as a prefix.
- **Graceful drain.** On SIGTERM: refuse new builds, send `server.going_away {retryAfterMs}`, wait
  up to `FLUXIQ_DRAIN_SECONDS`, exit.
- **HTTP from the extension** is not subject to CORS; Core sends no CORS headers. State-changing
  cookie requests get an `Origin` / `Sec-Fetch-Site` check in a new `apps/web/src/middleware.ts`
  and `lib/program-route.ts`; Bearer requests are exempt. `getfluxiq.com` is a different origin
  and is not trusted by the panel.

## Tenancy And Data

**Workspace** is the unit of isolation (the analogue of an AWS account): its own storage root,
members, policies and audit. Under `service`, each sign-up gets a personal workspace. Organisation
workspaces (several separated workers) are the enterprise feature; memberships are stored from the
start, so they need no migration.

**Layout v3** (`multi` only). `<dataRoot>/platform/` holds accounts, sessions, identities,
workspaces, members, platform principals, browsers, throttles and the platform audit.
`<dataRoot>/workspaces/<workspaceId>/` is a complete root as today, plus its IAM tables. Under
`single`, both are today's `.fluxiq` and no files move.

**Workspace manager** (`apps/web/src/lib/workspaces/`, replacing `globalThis.__fluxiqWebRuntime`):
a map of workspace to `{fluxiq, gateway, lastUsedAt}`; lazy `FluxIQ.create({rootDir})` plus the
host module; idle eviction after 15 minutes with an LRU cap sized from S3. Route handlers call
`workspaceFluxIQ(request)`; S4 lists the call sites first. Under `single` it holds one entry
created exactly as today.

**Gateway per workspace.** One listener verifies the hello credential against the platform store,
then hands the socket to that workspace's `ClientGatewayService`.

**Browser-owner invariant (every profile).** `selectSession` keeps only ready sessions whose
`operatorUserId` is the run's actor and loses the any-session fallback. The paired document
applies the same rule in the domain.

**Per-workspace singletons** (S4 confirms): `automationStudioContexts`, activity hub, host-lease
scope, step-log directory. Provider throttles stay process-wide.

**Storage.** SQLite per workspace on an encrypted volume; Postgres deferred behind `PlatformStore`;
an `ObjectStore` port when disk becomes the constraint. **Quotas** (`service`): storage bytes and
projects per workspace; one concurrent build per workspace.

**Retention** (H2; `service` defaults): runs 90 days (needs run deletion and the unused retention
store wired); unreferenced state assets 30 days; recordings and Flows until deleted; platform
audit 1 year. **Export and import** (H2): a consistent zip snapshot with a manifest, same format in
every profile. **Deletion** (H1, `deleteAccount`): revoke, evict, delete the workspace directory,
remove platform rows; backups age it out within 30 days.

**Documentation.** `docs/operations/data-and-state.md` gains layout v3;
`docs/architecture/platform.md` (new) records profiles, provisioning, IAM, tenancy and connect.

## Panel Customisation Extension Points

**Principles.** No fork; Core stays generic; data first, code second; Core enforces IAM on every
extension surface; the theme contract holds (a validated brand-accent subset, contrast checked);
extensions are trusted build-time host code, not a sandbox.

**Needed at launch: layer 1 and platform hooks** (the public pages now live in FluxIQWebsite).
- `FLUXIQ_HOST_MODULE` accepts a comma-separated list. A module may export
  `registerFluxIQPlatform(platform)` (once per process; product registry, hooks, `provisioning`)
  and `registerFluxIQHost(fluxiq)` (per workspace instance).
- **Layer 1, product manifest** (schema `PanelProduct`, `packages/contracts/src/platform/panel.ts`):
  `id`, `name`, `shortName`; `assets` (logo, favicon, sign-in art, served at
  `/product/assets/<name>`); `brand` (accent subset); `links` (website, terms, privacy, support,
  status); `auth` (sign-in copy, `signUpUrl`); `extensionStores` and `extensionClients` (feeding
  the Origin defaults); `email` (sender and templates). Server components read it, so there is
  no flash; without a product, stock branding.
- **Server hooks** (asynchronous, failure-isolated): `on("account.created" | "workspace.created" |
  "account.disabled" | "account.deleted" | "browser.connected" | "browser.revoked")`,
  `registerEmailTemplate`, `registerHumanCheck`, `registerBillingProvider`,
  `registerEntitlementPolicy`.
- **Generic onboarding cards** on the signed-in home, driven by the manifest: "Get the extension"
  (from `extensionStores`) and "Add your model key" (shown while the user has no key).
- `componentPacks` and `programExtensions` are deprecated.

**Later (H2): layer 2 and layer 3.** Layer 2 is declarative onboarding steps, settings sections
stored per workspace (`fluxiq.panel.settings()`), and nav items. Layer 3 is build-time panel
plugins (`FLUXIQ_PANEL_PLUGINS`): pages under `/x/<pluginId>/`, slots, API routes with `access`
under IAM. Nothing at launch needs them.

**What stays in Core:** sign-in, setup, welcome, reset, consent, connect, account, browsers and
delete pages; provisioning and its listener; IAM; discovery, the theme and the onboarding cards.
**What lives downstream:** the product manifest and assets, the default-project hook, email copy,
the extension client IDs (paired `apps/product`), and the website itself (FluxIQWebsite).

## Model Calls, Keys And The Billing Port

**Bring your own key only, in every profile;** no platform key; responsibility sits in the user
agreement. Each user's key is `secrets:key/<id>` in their workspace, owned by them and sealed with
AES-256-GCM under their password-derived key, so the operator cannot decrypt it at rest. Decrypted
keys exist only in memory for that user's unlocked sessions; never revealed to the browser, other
users or the operator; redacted from logs, step logs (off under `service`) and error reports.

**Selection fix (H1, security).** `session-key.ts` releases the caller's own key or the Flow's
`llmSecretKeyId`, after `secrets:UseKey` is allowed for that key, never the first key of anyone.

**Unlock.** Keys unlock at panel sign-in (the welcome link and Flow A's tab sign-in count). The
browser records `approvingSessionId`, so extension-started builds use that session's unlock while
it lives (S5 verifies). After a restart, extension-started builds stop with "Sign in at
app.getfluxiq.com to unlock your model key" (N4). H2 adds a browser-held unwrap key.

**Spend.** The per-Flow purse stays ($0.25 by default) on the user's own key; an optional daily
limit per user in H2. **Billing.** `BillingProvider` and `EntitlementPolicy` are ports with no-op
implementations (allow all) until something is sold. **Abuse.** The website's human check and
per-IP limits, Core's throttles, a verified email before connecting, `disableAccount`, quotas.

## Deployment And Operations

Core ships generic packaging; the paired document owns the getfluxiq.com infrastructure.

- **Image** (`deploy/docker/Dockerfile`): multi-stage Node 22, native `sqlite3` for Linux,
  `output: "standalone"` behind `FLUXIQ_WEB_STANDALONE=1`, the gateway bundle, optional host
  modules; non-root, read-only root except `/data`; `HEALTHCHECK`.
- **Example deployment.** `deploy/compose/self-hosted.compose.yml`, `deploy/caddy/Caddyfile.example`,
  `docs/operations/self-hosting.md` (DNS, setup code, backups, upgrade, restore, the provisioning
  listener for a self-hoster's own sign-up site, the licence note for `multi`).
- **Runtime support.** `/api/health`, `/api/ready`; JSON logs redacting tokens, cookies, codes,
  keys, passwords, bodies and page data; an internal Prometheus endpoint; drain; `migrate` with a
  backup first (forward-only).
- **Scaling.** Vertical first; cells (hosts owning workspace sets, Postgres platform store) only on
  measured need.
- **CI.** Image smoke (health, discovery, a provisioning round trip on the private listener), the
  public-profile Playwright smoke, Trivy. No deployment, no model calls.

## Security

**Assets:** accounts and sessions; connected-browser credentials (the highest value); workspace
data; users' provider keys; policies. **Actors:** anonymous users; a malicious tenant or worker; a
stolen credential; a hostile page; a malicious custom server; an operator insider; a compromised
website backend; the supply chain.

| # | Risk | Mitigation (stage) |
| --- | --- | --- |
| 1 | A compromised or buggy server drives browsers | Browser-owner invariant (hard rule and policy); consent and `runContext` checks in the extension; browser-side gates for money, send, delete; kill switch (H1) |
| 2 | Cross-tenant leak | Workspace-per-root; workspace from the principal only; per-workspace gateway; actions and resources on every endpoint; route matrix (H1) |
| 3 | Privilege escalation inside a workspace | Default deny; explicit deny wins; guardrails; `iam:` actions themselves under policy; boundaries for delegated admins (enterprise); every decision audited (H1) |
| 4 | Account takeover | Throttles; verified email; TOTP; revocation; email on a new browser (H1); OIDC (H2) |
| 5 | Connect-flow abuse | PKCE S256; fixed same-origin redirect; single-use codes; `state`; typed codes never in links; consent; no third-party script on the app origin (H1) |
| 6 | Website backend compromised | Provisioner policy denies all content and privileged policies; private listener with hashed token and source allowlist; no passwords cross it; rate limit; audited (H1) |
| 7 | Operator surfaces exposed | Setup-code claim; service guardrail; fix the "check nothing" endpoints; hidden paths (H1) |
| 8 | CSRF | Origin and `Sec-Fetch-Site` middleware; `__Host-` cookie; SameSite=Lax (H1) |
| 9 | Denial of service | Frame, rate and pairing limits; pruning; quotas; proxy limits (H1) |
| 10 | Theft or misuse of a user's key | Password sealing; `secrets:UseKey` per key; never revealed; redacted; selection fix; purse (H1) |
| 11 | Sensitive page data at rest | Extension-side screening (paired audit); encrypted volume and backups; step logs off; retention (H2) |
| 12 | Server-side code execution | Host modules are build-time operator code; custom nodes denied by guardrail; audit the Flow DSL (H1) |
| 13 | Supply chain | Lockfile; `pnpm audit`; Dependabot; pinned images; Trivy (H1) |

**Secrets rules.** The provisioning token, SMTP credential, setup code and later OIDC secrets live
only as mounted files or CI secrets; never in `.fluxiq`, the image, logs or the repository.
`SECURITY.md` gains the hosted boundaries.

**Exposure gate.** `app.getfluxiq.com` stays closed until the hardening checklist, the route
matrix, the IAM parity and escalation tests, a ZAP baseline with no high findings, and the review
checklist in `docs/operations/quality-and-security.md` pass. An external penetration test is
recommended; it can follow the store release by a few weeks (N3).

## Testing

**Unit and integration tests,** each in the `tests/` folder beside its subject:
- **IAM:** a vector table of IAM semantics (default deny, explicit deny wins, `NotAction`,
  `NotResource`, wildcards, variables, each operator, `IfExists`, groups, role trust, session
  policies, boundaries, guardrails); the catalog drift check; parity; an escalation suite (a
  `FluxIQUserAccess` principal cannot attach policies, assume roles or reach another owner's
  resources); audit rows for allow and deny.
- **Identity:** welcome link (single use, expiry, `continueUrl`), reset, owner claim, throttles,
  anti-enumeration. **Provisioning:** every operation, idempotency, the listener's token,
  rotation, source allowlist, refusal of a public bind, `forbidden_policy`.
- **Connect:** RFC 7636 vectors; code reuse and expiry; redirect and `state`; rotation, grace and
  reuse revocation; typed-code limits. **Transport and tenancy:** Origin grammar, limits, drain;
  workspace manager; host modules per instance; the browser-owner invariant. **Keys:** the
  selection fix, redaction, unlock tied to the approving session, no-op billing ports.

**Route matrix** (`apps/web/src/app/tests/`): calls every registry endpoint and route as workspace
A against B's identifiers, and each `ops:` or `platform:` action as a `FluxIQUserAccess`
principal, expecting refusal or not-found; fails on any endpoint without an action and resource.
**Core Playwright** (`apps/web/e2e/public-profile/`), under `service` behind Caddy `tls internal`
with a fixture host module: setup-code claim, account creation over the private listener, welcome
link, sign-in, consent, browsers, revoke, disable. Browser, stand-in, Lab and staging coverage is
in the paired document; live runs use the ten realistic scenarios only.

## Phases And Release Cut

Work merges as task branches on narrow checks (the tests beside each change and the structure
audit); full suites run in the twice-daily sweep. H1 is one paired unit: one task ID in both
repositories, nested worktrees, `dev` merged in daily.

**What forces each date** (agent throughput is not the constraint):
- **Contract freeze (10-30):** lanes building against each other need fixed interfaces; it
  follows S1 to S6 because their answers shape the contracts.
- **Lane dependencies,** not lane length, set 11-03 to 11-08: C needs S3, S4 and B1's store; B3
  needs B2; D needs A's gateway steps.
- **MVP qualification (11-10):** the MVP live lanes edit the extension's connection files until
  then. Core lanes do not wait: parity and single-tenancy identity keep them inert locally.
- **User actions:** VM, DNS, email DNS records, store developer account (paired U9), by 11-03;
  the user's review of the terms and privacy notice (paired D7).
- **Chrome Web Store review:** "within a few days, but it can take up to a few weeks" (Google),
  longer for `<all_urls>`. Only a clean submission shortens it.

| Lane | Owns (Core; may edit) | Dates | Agent-days |
| --- | --- | --- | --- |
| H0: S1 tab flow (paired D0); S2 Caddy carries `wss` and the private listener; S3 instance memory and start time; S4 global-instance callers and singletons; S5 key release for extension-started builds; S6 decision-audit volume under panel polling, list-filter cost | spike worktrees, written results in this document's reports | 10-28 to 10-30 | 3 |
| Contracts: discovery, connect, provisioning, gateway 0.2, IAM policy grammar, FRN, action catalog format, `PanelProduct` | `packages/contracts/src/{platform,iam}/`, `client-gateway.ts` | 10-29 to 10-30 | 2 |
| A hardening: profile resolution; public origin, `wss` URL, bundle path; Origin grammar and limits; pairing caps, crypto codes, pruning, audit ring; middleware and cookie naming; throttles; owner claim; "check nothing" endpoints; health, drain, logs; discovery route | `packages/fluxiq/src/platform/profile/`, `lib/fluxiq.ts`, `gateway-runtime/load.ts`, `client-gateway-websocket.ts`, `client-gateway/service/{pairings,sessions,audit-log}.ts`, `middleware.ts`, `api/auth/login/`, `lib/auth.ts`, `lib/login-attempts.ts`, `app/setup/`, `app/api/discovery/`, `SECURITY.md`, `docs/integrations/client-gateway-websocket.md` | 10-30 to 11-04 | 6 |
| B1 platform store and provisioning: `PlatformStore`; operations; private listener; command line; welcome link, reset, `EmailSender`; key selection fix | `packages/fluxiq/src/platform/{store,provisioning}/`, `apps/web/src/server/provisioning-listener/`, `app/{welcome,reset}/`, `identity-access/runtime/providers/`, `session-key.ts` | 10-30 to 11-04 | 5 |
| B2 IAM engine: FRN, grammar, evaluator, predefined policies, groups, roles, service identities, attachments store, decision audit, catalog generator, parity test | `packages/fluxiq/src/platform/iam/`, `identity-access/runtime/roles.ts` | 10-30 to 11-03 | 5 |
| B3 IAM enforcement: `action`, `resource`, `accessLevel` on every registration (several workers, partitioned by program directory); registry and route integration; list filtering; project ownership migration; `docs/architecture/platform.md` | `programs/*/api/` registrations, `programs/_shared/api.ts`, `lib/{program-route,operational-route-contract}.ts`, the 15 routes, `automation-studio/api/contracts/project.ts` and its migration | 11-03 to 11-07 | 6 |
| C tenancy: C1 layout v3 and workspace manager; C2 call-site migration in S4 batches (parallel workers by file); C3 gateway routing by credential, browser-owner invariant, per-workspace singletons, `deleteAccount` wiring; route matrix | `framework/storage-layout.ts`, `apps/web/src/lib/workspaces/`, the S4 call sites, `runtime/client-gateway-transport.ts`, `apps/web/src/app/tests/` | C1 10-31 to 11-04; C2, C3 11-03 to 11-07; matrix 11-07 to 11-08 | 11 |
| D connect: codes and tokens; credential with `approvingSessionId`; typed-code claim; connect, account and browsers pages; `revoked`, `going_away`, `runContext`; trusted-client migration | `packages/fluxiq/src/platform/connect/`, `trusted-clients.ts`, `lifecycle.ts`, `access.ts`, `pairing-flow.ts`, `app/connect/`, `app/account/`, `app/api/connect/` | 10-31 to 11-05 | 6 |
| E product manifest and hooks: `PanelProduct` registry, multi-module host loading, `registerFluxIQPlatform`, assets route, branding, onboarding cards, fixture host module | `packages/fluxiq/src/platform/panel/`, `layout.tsx`, `AuthShell.tsx`, `app/product/`, host-module loader | 10-30 to 11-01 | 2 |
| F packaging: Dockerfile, compose and Caddy examples, metrics, `migrate`, CI image job and scan, self-hosting guide | `deploy/`, `.github/workflows/`, `docs/operations/self-hosting.md` | 10-30 to 11-03 | 4 |

About 50 Core agent-days; about 38 more downstream. The sum is not the calendar: the critical
path runs H0, contracts, B2, B3, the route matrix and the gate, about 13 working days.

**Lane validation** (beside each change, plus): A, the S2 Caddy smoke (a `wss` hello reaches
pairing, a web Origin is refused, an oversized frame closes); B1, a provisioning round trip on the
listener and a refused public bind; B2, the vector table and parity; B3, parity across the whole
registry; C, the route matrix; D, the extension's D2 tests against each profile; E, the fixture
host module and the contrast test.

**Merges.** Each Core lane merges to `dev` when green. B3 and C2 touch every route: they merge
with parity green and are included in the next twice-daily sweep before any further merge. The
paired extension client merges on 11-10.

**H1 gate** (11-11 to 11-12) on staging: route matrix; parity and escalation suites; the paired
Lab gate (website stand-in, two tenants, ui:e2e sign-in); ZAP; the Security table review;
published terms and privacy; a reviewer test account on production. The user approves the
Chrome submission (about 11-13). getfluxiq.com sign-up opens on store approval.

**After launch.**
- **E1, enterprise IAM** (about 6 agent-days, parallel lanes): the panel's IAM console (users,
  groups, roles, policies, attachments), organisation workspaces and invites, customer-managed
  policies, permission boundaries, decision export, the policy simulator, the entitlement adapter.
- **H2:** Google and generic OIDC sign-in (SSO for enterprise); the browser-held unwrap key; the
  per-user daily limit; retention and run deletion; export and import; layers 2 and 3; an operator
  web page; the billing adapter when something is sold; Postgres and cells when measured.

## Risks

- **MVP contention.** H1 runs beside the MVP lanes; the MVP keeps priority. Core lanes merge only
  with parity green and stay inert under `local`.
- **IAM breadth.** 289 endpoints need correct resource extractors; a wrong one silently widens or
  narrows access. The route matrix, parity and escalation suites are the mechanical check; B3 is
  partitioned by program so each worker owns a reviewable slice.
- **Audit volume.** Recording every allow under panel polling may be large (S6). If so, store
  allow rows compactly; never drop or aggregate them away, since the user asked for every decision.
- **Instance cost** (S3): evict harder, or split runtime from storage, which re-plans C. **Hidden
  globals:** S4, the route matrix and the two-tenant Lab scenario cover them.
- **Hand-written authorization:** one public client, code plus PKCE; RFC vectors and a review.
  **Unlock after restarts:** users sign in again after a deploy until H2; announce and drain.
- **One provider:** DeepSeek's processing in China needs disclosure (Q8). **No legal entity:**
  selling enterprise needs a contracting party; nothing in the build does.

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

Owner: the user, for all of them. A recommendation follows each; the plan proceeds on it.

- **N1. When to submit to the Chrome Web Store?** Recommendation: at the H1 gate, about 11-13,
  so the first listing has sign-in. A local-only listing first costs a second review.
- **N2. Hostnames.** Recommendation: the website on `getfluxiq.com` (with `www` redirected), Core
  on `app.getfluxiq.com`, staging on `staging.getfluxiq.com` and `app.staging.getfluxiq.com`,
  `status.getfluxiq.com` for status. This replaces the earlier one-origin answer.
- **N3. Open sign-up or invite codes at launch?** Recommendation: invite codes for the first two
  weeks while the external penetration test runs, then open.
- **N4. Signing in again after a server restart until H2?** Recommendation: acceptable for launch.
- **N5. Keep today's free multi-user self-hosting?** Recommendation: yes. Several users sharing
  one self-hosted workspace with the predefined Administrator and ReadOnly policies stays free,
  as it is today; separated workers, groups, custom policies, roles, boundaries and SSO are the
  enterprise feature.
- **N6. How is enterprise enabled on self-hosted?** Recommendation: a signed entitlement file read
  by the `EntitlementPolicy` port, issued under a commercial agreement once a contracting party
  exists; on getfluxiq.com, by plan through the billing port.
- **Q5. Sign-in providers?** Recommendation: email and password at launch; Google in H2; generic
  OIDC for self-hosters and enterprise SSO.
- **Q7. Hosting provider and region?** Recommendation: one VM (Hetzner or DigitalOcean, 4 vCPU,
  16 GB) running Docker Compose, in the region of most expected users.
- **Q8. How should DeepSeek's processing in China be disclosed?** Recommendation: in the privacy
  notice and at key entry, with a second provider adapter after launch.
- **Q10. Operator console?** Recommendation: the command line at launch; a web page in H2.

### 2026-10-28 — Revised around the user's 2026-10-18 directions
- Agent: supervisor; plan revision by a worker-heavy (brief H1), notes `!FluxIQWebExtension/docs/working/hosted-production-plan/reports/revision-2026-10-28-notes.md`
- Changed: FluxIQWebsite (Next.js 16 static export on Hostinger) is the public site at getfluxiq.com and gains sign-up and its backend; Core moves to app.getfluxiq.com behind a private provisioning listener; `apps/site` shrinks to `apps/product`; a local website stand-in (`packages/website-stand-in/`, W0-W4) comes first; permissions follow AWS IAM (FRNs, generated actions, policies with explicit deny, predefined `FluxIQUserAccess`/`FluxIQOwnerFullAccess`, an inert-for-local parity test); the schedule is re-cut into parallel lanes (hosted gate 11-11/12, store submission about 11-13, each date's constraint named). The "Next revision owed" block is removed.
- Validation: the worker checked the cited Core facts in code (no `platform/` or provisioning yet; one permission check in `_shared/api.ts`; 289 permission declarations); `node scripts/structure-audit.mjs` after the swap (below).
- Outcome: plan revised; D0 and Core H0 can start. Open for the user: N2 (two hostnames), N5, N6, U9 (VM, DNS, store developer account), U10 (Google Analytics vs decline-by-default), U11 (go-ahead to edit FluxIQWebsite).
