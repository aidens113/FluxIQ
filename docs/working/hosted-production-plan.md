# Hosted Production Plan

Status: Active
Status detail: C1 workspace/runtime and E/D5 product foundations independently verified and merged on dev. C2/C3 caller migration/routing and deployment gates remain.
Created: 2026-10-17
Last updated: 2026-10-30
Owner: Lane lead hosted-production-planner (plan); the senior supervisor agent owns execution
Scope: Core side of running FluxIQ in production as one codebase with three deployments (getfluxiq.com, local, self-hosted): identity and account provisioning, IAM-style permissions on every surface, extension sign-in, gateway transport, tenancy and storage, panel extension points, bring-your-own-key model calls, deployment, security, tests, release cut. Browser, store, website, local simulation and Lab work is in the paired document.
Paired document: C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/docs/working/hosted-production-plan.md
Related: [package boundaries](../architecture/package-boundaries.md), [current system](../architecture/current-system.md), [client gateway](../integrations/client-gateway-websocket.md), [data and state](../operations/data-and-state.md), [quality and security](../operations/quality-and-security.md), [ui theme](../architecture/ui-theme.md), [MVP final month](./mvp-final-month-plan.md), [working index](./README.md)

---

## Current State

**What is true now, 2026-10-30.** Profiles, platform/IAM/provisioning foundations, gateway hardening and C0 closure are merged.
C1 workspace lifecycle and E/D5 product foundations are merged (E: Core4a522cd8/downstream6c88f928);70 merge-contract tests pass. C2/C3 caller migration/routing are next.
H0 evidence (2026-10-28) remains in `hosted-production-plan/reports/h0.md` and `h0-s1.md` to `h0-s6.md`.
The earlier baseline/ledger is archived at `hosted-production-plan/archive/2026-10-28-baseline-and-ledger.md`; the original H0 findings below are historical evidence.

**The user's directions of 2026-10-18 are folded in:** FluxIQWebsite is the public site (it gains
sign-up and a backend, built locally first as a stand-in; paired document), Core keeps sign-in,
connect and the panel on `app.getfluxiq.com`; permissions follow AWS IAM, tenancy an enterprise
feature; the schedule is re-cut into parallel lanes.

**User decisions** (2026-10-17, 10-18, 10-27): self-hosting stays first-class (binding): three
deployments, one codebase, the extension connects to any, and single-user self-hosting needs none
of the multi-user machinery. Hosted ships with the Chrome Web Store release, built into Core;
getfluxiq.com runs on Core as its control panel and the website's backend provisions users. Bring
your own provider key, no platform key, billing a port. No company exists yet. Optional cookies
are declined by default (separate work). No feature freeze.

**Architecture and ownership.** One image, three profiles (`FLUXIQ_PROFILE=local|self-hosted|service`);
getfluxiq.com serves FluxIQWebsite and app.getfluxiq.com serves Core; the website backend calls
`platform.provisioning` on a private listener and never handles a password; one IAM evaluator
audits every decision; workspace-per-root tenancy under `service`; PKCE sign-in in a normal tab;
keys sealed under the user's password. Core owns the domain-neutral contracts; the paired
document owns the extension, stores, website, infrastructure, docs, legal and Lab.

**H0 results** (the section that owns each change is named).
- **S1 sign-in tab flow (= D0) passes** in Chrome 156, Edge 156 and Playwright's Firefox 1475, with
  no new permission; the paired document owns the changes.
- **S2 Caddy and `wss`:** transport, Origin filtering and `pairing_required` work over `wss` through
  a Node TLS proxy stand-in; Caddy was not run (not installed). Lane A gaps: no `moz-extension://*`
  matching, frame cap, hello deadline, rate limit or client IP; public profiles must require an
  allowlist. **Decision** (supervisor, 2026-10-28; the user can overrule, N7): no Origin is refused
  on `service` and accepted on `local` and loopback `self-hosted`.
- **S3 instances:** idle cost ~0.5 MB and ~10 ms; `close()` is not eviction. LRU cap 100, pinned
  while busy, C0 fixes first (Tenancy And Data). **S4:** 31 direct call sites in 22 files plus 17
  via `lib/auth.ts`; C2 is 5 batches over 18 files; four singletons the plan missed.
- **S5 key release:** `approvingSessionId` cannot be the key handle (the session ends within 12
  hours, the credential lasts 60 days). Resolve the user's live unlock on each call, else a typed
  `secrets.locked`; `session-key.ts` takes the Flow's key or the caller's own, never the newest
  key of anyone; an administrator's session revoke drops the unlock (Model Calls).
- **S6 audit volume:** a compact ~59 B row, day-partitioned and written through a buffer off the
  request path, replaces the 450 B JSON row (3.4 TB over 90 days at 1,000 users) (Permissions).
- **Estimates:** Core about 56 agent-days (was 50); dates unchanged (parallel lanes).

**Schedule** (details in Phases And Release Cut): H0 done 10-28; contract freeze 10-30; Core and paired
lanes in parallel to 11-08 (the extension's connection files merge 11-10); hosted gate 11-11 to
11-12; store submission about 11-13; public when Google approves.

**Next.** (1) Contracts frozen 2026-10-28 (t784, `@fluxiq/contracts` 0.3.0: `/platform`, `/iam`,
gateway 0.2 additions; decisions in the paired document's ledger); B1 (t789) and B2 (t788) merged 10-28; B3 (t803), lane A (t802) and C0 (t808) merged 10-29 (B3 inert on `service` until C wires it); C1 with the IAM wiring (t813) and E with D5 (t814) in flight; C starts with
the H0 changes, each as its own task. (2) The
user answers N1 to N7 and creates the VM, DNS and store developer account (paired U9). Nothing
blocks H1.

**Not verified** (open after H0).
- Caddy itself (WebSocket pass-through, Caddyfile syntax, `header_up` replacing a client
  `X-Forwarded-For`); the draft is in the S2 spike.
- Whether Next.js serves `app/.well-known/` directly: the test could not run (webpack rejects `!`
  in the checkout path; turbopack rejected the junctioned `node_modules`), so the rewrite stays.
- The memory of a building workspace (25 MB per used workspace is an assumption); a natural idle
  stop over 30 s; real polling rates and Core's real evaluator; whether bootstrap command records
  carrying `actorSessionId` are persisted (the raw cookie at rest); the chat wording of a mid-build
  locked-key error. Chrome item-ID timing, stock Firefox and Web Store builds: paired document.

## Current System Baseline

Moved 2026-10-28 to `hosted-production-plan/archive/2026-10-28-baseline-and-ledger.md`: the audit of
the system before this plan, with H0's corrections inline (key choice, the gateway's missing limits
and client IP, four more singletons). Read it before changing the single-tenant code paths.

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
- **List endpoints** filter items by the item's `Read` action (full-access fast path above),
  with one compiled evaluator per request and pages capped near 100 items (S6).
- Under public profiles an endpoint with no action and resource is refused at startup.

**Audit of every decision.** Each decision, allow or deny, is recorded and read back as
`{time, requestId, principal, action, resources, decision, matched {policy, sid} | "implicit",
origin, ipPrefix}`, in the workspace root (platform decisions in the platform store). **Stored
compactly** (H0-S6): integer epoch seconds, a request counter, and principal, action, resource,
policy, origin and IP prefix interned in dictionary tables, about 59 B a row against 450 B as
JSON. Allows are partitioned by day, so 90-day expiry (`service`) is a drop; denies and IAM
changes (1 year) have their own time-indexed table. **Writes stay off the request path:** a buffer
flushes in one transaction every 1 s or 100 rows (SQLite WAL), denies and IAM changes at once; a
crash can lose up to a second of allows. Every per-item list decision keeps its own row; the
full-access fast path writes one row. Sizing: panel polling makes 40,000 to 85,000 allow rows per
user per day, 0.2 to 0.45 GB per user over 90 days. A user sees decisions about their own
principal; a workspace admin sees the workspace; the operator uses the command line. Enterprise
adds export and a policy simulator.

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
   ID, user, workspace and a digest of the approving session) and redirects to `/connect/done#code=..&state=..`.
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
- `approvingSessionId` is a digest of the approving session, for audit only, never a key handle:
  the session ends within 12 hours, the credential lasts 60 days (Model Calls).
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
gains `runContext {runId, actorUserId, workspaceId, origin, startedFromSessionId}`
(`startedFromSessionId` is a session digest or the gateway session id, never the raw session id).

**Migration.** Under single tenancy, trusted clients become browsers of their approver. Legacy
tokens keep working on loopback for two releases. Public profiles accept only user-bound
credentials.

## Gateway Transport Over The Internet

- **Same origin as the panel.** Caddy routes `app.getfluxiq.com/client` to the gateway; one
  certificate, port 443 only; the gateway stays plain `ws` behind it.
  `FLUXIQ_PUBLIC_CLIENT_WS_URL` becomes authoritative for status and discovery (`lib/fluxiq.ts`);
  the bundle path in `gateway-runtime/load.ts` becomes configurable. H0-S2 proved `wss` to plain
  `ws` and Origin filtering through a Node TLS proxy; Caddy has not run (draft in the S2 spike).
- **Origin rule** (`client-gateway-websocket.ts`; exact-string matching only today): exact
  origins, `chrome-extension://<id>` (Chrome and Edge IDs differ), `moz-extension://*` by prefix
  (Firefox IDs are per-install). Other web origins and `*` refused. A public profile refuses to
  start without an allowlist (none admits every Origin) and defaults to the product's extension
  IDs plus `moz-extension://*`. A missing Origin (supervisor decision 2026-10-28, N7) is refused
  on `service` and any public bind and accepted on `local` and loopback `self-hosted`; today it
  is refused whenever an allowlist is set, and a test pins that.
- **Limits** (configurable, with metrics; none exists today): 16 MiB frames, refused before
  buffering; hello within 10 seconds; 50 messages per second, bursts of 200; ended sessions
  pruned; an audit ring of 10,000 per workspace with security events persisted; pending pairings
  capped as in Flow B.
- **Client IP.** Neither the peer address nor `X-Forwarded-For` is read today; lane A plumbs both
  into sessions and audit, trusting the header only with `FLUXIQ_TRUST_PROXY`, audited as a
  prefix. Caddy replaces the client-sent header.
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
a map of workspace to `{fluxiq, gateway, lastUsedAt, busy}`; lazy `FluxIQ.create({rootDir})` plus
the host module; idle eviction after 15 minutes under an LRU cap of 100
(`FLUXIQ_WORKSPACE_CACHE_MAX`), a safety bound rather than a RAM fit (an idle instance is ~0.5 MB
and 10 ms; the 3.5 to 7 s module load is per process, S3). **A workspace is pinned while a run,
build, scheduled task or open socket exists**; an idle workspace with a live key unlock may be
evicted, and its keys stay held in the manager's `HeldKeys` until their own expiry (lead decision,
2026-10-29: pinning every unlocked workspace keeps whole instances in memory, and locking keys on
eviction forces a re-unlock). Callers use
`workspaceFluxIQ(request or headers/cookies)`; pages, `lib/auth.ts` and login have no `Request` and
resolve through the platform session store (S4 D1). Under `single` it holds one entry created
exactly as today. **C0 (t808, merged 2026-10-29) made `close()` safe for eviction:** the hub
subscription is removed on close (the hub stays shared, filtered by project id, so per-instance
event isolation is C3's); `programStateConnections` is one pool per storage root; an injected
`HeldKeys` survives `close({ mode: "evict" })` while an instance's own keys are revoked; a leak test
proves nothing survives a closed instance. C1's manager calls `heldKeys.revokeAll()` on deletion
and real shutdown.

**Gateway per workspace.** One listener verifies the hello credential against the platform store,
then hands the socket to that workspace's `ClientGatewayService`.

**Browser-owner invariant (every profile).** `selectSession` keeps only ready sessions whose
`operatorUserId` is the run's actor and loses the any-session fallback. The paired document
applies the same rule in the domain.

**Per-workspace singletons** (S4): `automationStudioContexts`, the activity hub, the host-lease
scope, the gateway-trace and offline-trial `installed` slots, the login `trackers` map. The
step-log directory is one process env var: off under `service`, else per workspace. One shutdown
handler closes all entries; `FLUXIQ_PUBLIC_CLIENT_WS_URL` goes with C3's single listener;
`getFluxIQWebRuntimeStatus` omits `hostRoot` and `fluxiqDir` under `service`. Provider throttles
stay process-wide.

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

**Selection fix (H1, security).** Today `session-key.ts` takes the newest enabled DeepSeek key of
anyone, ignores the Flow's `llmSecretKeyId` and checks no `secrets:UseKey`; release then refuses a
key that is not the caller's, a denial rather than a leak (H0-S5). It takes the Flow's
`llmSecretKeyId`, else the caller's own newest enabled DeepSeek key, after `secrets:UseKey`.

**Unlock.** Keys unlock at panel sign-in (the welcome link and Flow A's tab sign-in count). The
approving session is not the key handle: it ends within 12 hours, the credential lasts 60 days,
and its id is the cookie. **Each model call resolves the user's live unlock in this workspace**,
preferring the session the build started from, else raises a typed `secrets.locked`; a logout
during a build no longer fails it while another unlock lives. An administrator's `revokeSession`
also drops the unlock, as logout does. An eviction keeps the unlock (C0). After a restart or a key's own expiry, one message covers every
locked path, "Sign in at app.getfluxiq.com to unlock your model key" (N4), and the panel offers a
re-unlock with the password without signing out. H2 adds a browser-held unwrap key.

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
| 9 | Denial of service | Frame, hello and rate limits (none exist today, S2); pairing limits; pruning; quotas; proxy limits; eviction pins busy workspaces (H1) |
| 10 | Theft or misuse of a user's key | Password sealing; `secrets:UseKey` per key; never revealed; redacted; selection fix (Flow key or the caller's own); per-call unlock resolution; admin revoke drops the unlock; purse (H1) |
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
  resources); audit rows for allow and deny, the buffered flush and its crash window, day-partition expiry.
- **Identity:** welcome link (single use, expiry, `continueUrl`), reset, owner claim, throttles,
  anti-enumeration. **Provisioning:** every operation, idempotency, the listener's token,
  rotation, source allowlist, refusal of a public bind, `forbidden_policy`.
- **Connect:** RFC 7636 vectors; code reuse and expiry; redirect and `state`; rotation, grace and
  reuse revocation; typed-code limits. **Transport and tenancy:** Origin grammar (prefix match, the missing-Origin rule, no start without an allowlist), frame,
  hello and rate limits, client IP, drain; the instance leak test; eviction skips a busy workspace;
  workspace manager; host modules per instance; the browser-owner invariant. **Keys:** the
  selection fix, redaction, per-call unlock resolution (logout during a build, administrator revoke, `secrets.locked`), no-op
billing ports.

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
- **Contract freeze (10-30):** lanes building against each other need fixed interfaces; H0
  finished 10-28 and its answers (digest fields, `secrets.locked`, Origin grammar) go into it.
- **Lane dependencies,** not lane length, set 11-03 to 11-08: C needs B1's store, and C0 comes
  before any eviction; B3 needs B2; D needs A's gateway steps.
- **MVP qualification (11-10):** the MVP live lanes edit the extension's connection files until
  then. Core lanes do not wait: parity and single-tenancy identity keep them inert locally.
- **User actions:** VM, DNS, email DNS records, store developer account (paired U9), by 11-03;
  the user's review of the terms and privacy notice (paired D7).
- **Chrome Web Store review:** "within a few days, but it can take up to a few weeks" (Google),
  longer for `<all_urls>`. Only a clean submission shortens it.

| Lane | Owns (Core; may edit) | Dates | Agent-days |
| --- | --- | --- | --- |
| Done 10-28 to 10-29: H0 (t782), contracts (t784), B1 (t789), B2 (t788), B3 (t803), A (t802); their rows are in `hosted-production-plan/archive/2026-10-28-baseline-and-ledger.md` | see the Work Ledger | 10-28 to 10-29 | 30 |
| C tenancy: C0 eviction prerequisites (disposable activity-hub subscription, per-instance `programStateConnections`, `HeldKeys` out of the instance with an eviction mode of `close()`, leak test); C1 layout v3 and workspace manager (LRU cap 100, pinned while busy); C2 call-site migration in five S4 batches (auth, client-gateway, framework and recordings, programs API, pages: 18 files, 29 calls, 14 test files; parallel workers by file; C1 keeps `lib/fluxiq.ts`, `lib/auth.ts`, `instrumentation.ts`); C3 gateway routing by credential, browser-owner invariant, per-workspace singletons (with the four S4 added), `deleteAccount` wiring; route matrix | `framework/{storage-layout,index}.ts`, `automation-studio/runtime/activity/`, `programs/_shared/runtime.ts`, `secret-keys/runtime/{service,held-keys}.ts`, the module holding `programStateConnections`, `apps/web/src/lib/workspaces/`, the S4 call sites, `runtime/client-gateway-transport.ts`, `apps/web/src/app/tests/` | C0 10-31 to 11-03; C1 10-31 to 11-04; C2, C3 11-03 to 11-07; matrix 11-07 to 11-08 | 13 |
| D connect: codes and tokens; credential with `approvingSessionId` as an audit digest; typed-code claim; connect, account and browsers pages; `revoked`, `going_away`, `runContext` (`startedFromSessionId` a digest); trusted-client migration | `packages/fluxiq/src/platform/connect/`, `trusted-clients.ts`, `lifecycle.ts`, `access.ts`, `pairing-flow.ts`, `app/connect/`, `app/account/`, `app/api/connect/` | 10-31 to 11-05 | 6 |
| E product manifest and hooks: `PanelProduct` registry, multi-module host loading, `registerFluxIQPlatform`, assets route, branding, onboarding cards, fixture host module | `packages/fluxiq/src/platform/panel/`, `layout.tsx`, `AuthShell.tsx`, `app/product/`, host-module loader | 10-30 to 11-01 | 2 |
| F packaging: Dockerfile, compose and Caddy examples, metrics, `migrate`, CI image job and scan, self-hosting guide | `deploy/`, `.github/workflows/`, `docs/operations/self-hosting.md` | 10-30 to 11-03 | 4 |
| P panel polling cuts (optional, S6): slow or pause the hidden-tab conversation beat; one server-side "pending asks" read in place of `1 + min(N,12)` calls a cycle; gate run control and the Clients view on tab visibility; merge the pairing and prompt reads; add call counts to the parity overhead check | `apps/web/src/app/{GlobalConversationPrompt,GlobalClientGatewayPairing}.tsx`, `thread/poller.ts`, `runtime/useRunControl.ts`, `clients/useClientGatewayController.ts` | any time before the gate | 1 |

About 56 Core agent-days (H0's 3 spent; the H0 results added 6) and about 39 more downstream.
The sum is not the calendar: the critical path runs contracts, B2, B3, the route matrix and the
gate, still about 13 working days from 10-28, because the added work sits in parallel lanes.

**Lane validation** (beside each change, plus): A, the Caddy smoke from the S2 spike, its first
real run (a `wss` hello reaches pairing, a web or missing Origin is refused, an oversized frame
closes, a silent socket drops at the hello deadline); B1, a provisioning round trip on the
listener, a refused public bind, the selection and `secrets.locked` tests; B2, the vector table,
parity and the buffered-audit tests; B3, parity across the whole
registry; C, the leak test and the route matrix; D, the extension's D2 tests against each profile; E, the fixture
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
- **Audit volume** (S6): affordable only compact and buffered (213 to 449 GB over 90 days at
  1,000 users, against 1.6 to 3.4 TB as JSON); rates come from timer constants, so re-measure in
  H1. Never drop or aggregate allows; the user asked for every decision.
- **Eviction and instance cost** (S3, S4): eviction leaks and breaks other workspaces until C0
  lands, so nothing is evicted before it; a building workspace was not measured. **Hidden
  globals:** S4 found four the plan missed; the route matrix and the two-tenant Lab scenario cover
  the rest. **Key unlock** (S5): a restart, deploy or eviction locks every key and users sign in
  again. **Gateway exposure** (S2): no limits exist today and Caddy has not run.
- **Hand-written authorization:** one public client, code plus PKCE; RFC vectors and a review.
  **Unlock after restarts:** users sign in again after a deploy until H2; announce and drain.
- **One provider:** DeepSeek's processing in China needs disclosure (Q8). **No legal entity:**
  selling enterprise needs a contracting party; nothing in the build does.

## Work Ledger

The plan's history (2026-10-17 to 10-28) and the H0 fold moved on 2026-10-29 to
`hosted-production-plan/archive/2026-10-28-baseline-and-ledger.md`, with B3 (t803, moved 2026-10-29); the contract freeze, B1 and B2 entries are in the paired document's ledger.

Accepted lane A, C0 and follow-up validation moved verbatim to [archive/2026-10-30-accepted-foundations.md](hosted-production-plan/archive/2026-10-30-accepted-foundations.md).

### 2026-10-30 - Accepted foundation history compacted
- Agent: Codex lead
- Changed: archived three accepted entries for C1/product continuation; retained all open decisions and H0 evidence.
- Validation: Node extraction -> three accepted entries preserved verbatim, equality checked before replacing source range.

### 2026-10-30 - C1 workspace foundation independently accepted and merged (t813)
- Agent: Codex lead; adversarial worker resume_t813, paired downstream report `reports/codex-1030/t813-result.md`.
- Changed: workspace lifecycle barriers, profile IAM, tenant key custody, background-task drain and root-owned audit/reload cleanup; Core0.11.0; paired finish passed, Core70 contracts and merges f9affe6c/af6c544f. C2/C3 routing remains separate.
- Validation: lead Core background-task tests ->9 passed; web workspace/provisioning/key-custody ->14files/123 passed; Core/web typechecks,3-library build and docs freshness passed; structure ->failures[],474warnings/1144baselined.
- Not verified: tenant gateway sockets, browser/Next production behavior or full sweeps; no paid calls or panel management.

### 2026-10-30 - E/D5 product and owned seed accepted (t814)
- Agent: Codex lead; workers resume_t814/product_ownership_review, reports in paired downstream codex-1030 folder.
- Changed: product/brand/assets registry and once-only host loading; additive trusted-host creator helper and serialized retry-safe owned seed. Core0.12.0; no wire/persistence format change.
- Validation: lead panel32, web27, ownership36 and product18 passed; Core/web/product types,3libs, docs/model-text/structure passed. Real service-IAM tests prove owner/non-owner, fallback replacement, conflict and partial/concurrent retry behavior.
- Not verified: later C2/C3 host/provisioning/email/discovery wiring, browser rendering or full sweeps; no paid calls/panel management.

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
- **N7. Missing Origin on the gateway?** Supervisor decision 2026-10-28, which you can overrule:
  refuse it on `service` and any public bind, accept it on `local` and loopback `self-hosted`
  (extensions always send an Origin). Self-hosted beyond loopback follows `service` (the
  supervisor's reading of "allowlist required").
- **Q5. Sign-in providers?** Recommendation: email and password at launch; Google in H2; generic
  OIDC for self-hosters and enterprise SSO.
- **Q7. Hosting provider and region?** Recommendation: one VM (Hetzner or DigitalOcean, 4 vCPU,
  16 GB) running Docker Compose, in the region of most expected users.
- **Q8. How should DeepSeek's processing in China be disclosed?** Recommendation: in the privacy
  notice and at key entry, with a second provider adapter after launch.
- **Q10. Operator console?** Recommendation: the command line at launch; a web page in H2.
