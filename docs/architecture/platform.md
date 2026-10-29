# Platform: The IAM Engine

`packages/fluxiq/src/platform/` holds the hosted platform's own machinery, as
distinct from the programs, flows and runtime that run inside a workspace.
Today it holds three things: the IAM engine under `platform/iam/`, the
platform store under `platform/store/` and the account provisioning service under
`platform/provisioning/` (lane B1). The IAM engine
answers one question, "may this principal perform this action on these
resources?", using policy documents in the shape AWS IAM administrators
already know.

## Status

The engine is complete, tested and enforced (lane B3, t803). Provisioning
(lane B1) authorises each operation through it (see Provisioning), every
program endpoint is decided by it in `GlobalProgramApiRegistry.call`, and every
authenticated app route asks the registry's `authorize` (see
[Enforcement](#enforcement)). On `local` and `self-hosted` each decision equals
the role check it replaced, by construction and by the parity tests (see
[Parity](#parity)); only `service` narrows a `FluxIQUserAccess` user to their
own resources.

The running product still constructs the registry with no `iam` options, so it
decides as `local` with a discarding audit sink; the profile, the per-workspace
IAM store and the audit store are wired by lanes A and C (see
[Not yet wired](#not-yet-wired)).

The plan's terms (principals, FRNs, policy kinds, actions) are in the
[hosted production plan](../working/hosted-production-plan.md), "Permissions
(IAM Model)". The wire contracts are frozen in `@fluxiq/contracts/iam`; this
document describes the implementation behind them.

## Layout

`platform/iam/` has one directory per responsibility. Each has a barrel
`index.ts`, and `platform/iam/index.ts` re-exports all of them. Shared types
sit in `iam/types.ts`.

| Directory | Responsibility | Main exports |
| --- | --- | --- |
| `frn/` | Build the FRNs the engine needs. | `iamWorkspaceFrn`, `iamPrincipalFrn`, `iamProgramFrn` |
| `evaluate/` | Pure, deterministic policy evaluation. | `compileIamPolicySet`, `evaluateIamRequest`, `iamTrustAllows` |
| `predefined/` | The seven FluxIQ-managed policies. | `IAM_PREDEFINED_POLICY_DEFINITIONS`, `resolveIamPredefinedPolicy`, one constant per policy |
| `store/` | Persist policies, attachments, groups, roles, service identities. | `IamStore`, `IamStoreError`, `IamRecordRepository` |
| `audit/` | Compact, day-partitioned decision log. | `IamAuditStore`, `BufferedIamAuditSink`, `MemoryIamAuditSink`, `iamIpPrefix` |
| `authorize/` | Resolve, evaluate, audit: the one entry point. | `IamAuthorizer`, `IamRequestAuthorizer`, `IamPolicySource` |
| `catalog/` | Generate the action catalog from endpoint registrations. | `generateIamActionCatalog`, `IAM_READ_ONLY_ACTIONS`, `IAM_DESTRUCTIVE_ACTIONS` |
| `parity/` | Prove IAM agrees with today's role checks. | `compareIamRoleParity` |

Dependency direction: `authorize` uses `evaluate`, `audit` and a policy
source; `store` fits the policy source structurally; `predefined` and
`parity` use `evaluate` and `catalog`. `evaluate` imports nothing else from the
engine. The one file outside `platform/` the work touched is
`programs/identity-access/runtime/roles.ts` (see [Role mapping](#role-mapping)),
and it imports nothing from `platform/`.

## Evaluation

`evaluateIamRequest` takes a compiled policy set, the principal, one action,
one or more resources and the request context, and returns an `IamDecision`.
`compileIamPolicySet` does the work once per set: every pattern becomes an
anchored regular expression and policy variables are bound.

### Decision order

1. A matching `Deny` in the identity policies, guardrails, session policies or
   permission boundary denies. The decision cites the first one in that order.
2. Otherwise the request is allowed only when all of these hold: an identity
   `Allow` matches; every session policy has a matching `Allow`; the
   boundary, if there is one, has a matching `Allow`. Identity AND every
   session AND boundary, as in AWS.
3. Otherwise it is an implicit deny (default deny).

An `Allow` in a guardrail never grants (the grammar refuses one anyway). A
malformed request is an implicit deny: an action that is not a canonical
`<service>:<Action>` name (so no wildcards, and `studio:createProject` is
refused), or a resource that is not a concrete FRN.

### Matching

- `*` matches any run of characters, including none, and crosses `:` and `/`.
  `?` matches exactly one character. Everything else is literal.
- Actions compare case-insensitively. Resources and trust principals compare
  case-sensitively. String conditions are case-sensitive.
- `NotAction` and `NotResource` invert the match.

### Variables

`${fluxiq:PrincipalId}` binds to the principal's id and `${fluxiq:WorkspaceId}`
to the workspace the set was compiled for. They are bound at compile time in
resource patterns and string condition values, and a bound value is literal:
its characters are never wildcards.

A pattern or value that needs an unbound or unknown variable matches nothing.
So a `NotResource` using one excludes nothing, and a deny fence such as
`Deny NotResource frn:fluxiq:*:${fluxiq:WorkspaceId}:*` denies everything for
a principal that has no workspace. That fails closed.

### Conditions

Operators are ANDed, keys under an operator are ANDed, and a key's listed
values are ORed. Supported operators: `StringEquals`, `StringNotEquals`,
`StringLike`, `Bool`, `IpAddress`, `NotIpAddress`, `DateLessThan`,
`DateGreaterThan`, each with the `IfExists` suffix. IPv4, IPv6 and CIDR work;
`::ffff:a.b.c.d` is compared as IPv4; addresses of different families never
match.

A missing condition key follows AWS: an `...IfExists` operator passes;
otherwise a negated operator (`StringNotEquals`, `NotIpAddress`) passes; every
other operator fails. So `Deny` with `NotIpAddress` denies a request that has
no source IP, and `Allow` with `StringNotEquals` allows one where the key is
absent. A null resource owner or null workspace counts as missing.
`fluxiq:ResourceTag/<key>` reads only the resource's own keys.

A policy that breaks the grammar (an unknown operator, a key and operator of
the wrong type, a statement with both or neither of `Action` and `NotAction`)
makes compilation throw rather than quietly allow or deny. A parsed document
can never contain one.

### The fullAccess fast path

A set is `fullAccess` when all of these hold: it has a workspace; no policy in
it holds any `Deny` (so any guardrail turns it off); some identity statement
is an unconditional `Allow` of `*` on `*` or on
`frn:fluxiq:*:${fluxiq:WorkspaceId}:*`; and every session policy and the
boundary hold such a statement too.

For a resource in the same workspace, or the workspace's own FRN, such a set
allows without matching statements one by one. The fast path never changes a
decision: with no `Deny` anywhere, full evaluation would allow the same
resource. Only the cited statement differs (the full-access grant rather than
an earlier, narrower one). `IamDecision.fullAccess` is true only when every
resource of an allowed request took the path, and the authorizer uses it to
skip per-item list filtering.

### Trust policies

`iamTrustAllows` decides who may assume a role. It binds the caller's id and
the context workspace, needs `Principal.FluxIQ` to match the caller's FRN and
the action to match `iam:AssumeRole`, evaluates conditions with resource keys
missing, lets `Deny` win, and otherwise returns the first matching `Allow`.

## The resource rule

A request names no pattern, only concrete FRNs. Every program registration now
declares the resource it acts on (see [Enforcement](#enforcement)); the table
below is the fallback for a registration that declares none (test doubles
only: a registry test fails the build on any live one), and the rule for a
create or a list across the whole workspace:

| Request | Resource evaluated |
| --- | --- |
| Create or list in a workspace service | `frn:fluxiq:platform::workspace/<ws>` |
| Any other non-operator action | the same workspace FRN |
| Operator program action | `frn:fluxiq:ops:<ws>:program/<programId>` |

The workspace FRN has an empty workspace segment, so the content pattern
`frn:fluxiq:*:${fluxiq:WorkspaceId}:*` does not match it. A policy that
should cover the whole workspace, including top-level creates and lists, must
list the workspace FRN as well (or use `*`). The predefined policies that
grant workspace-wide access do.

## Predefined policies

All are version `v1`, parsed against the grammar when the module loads and
deep-frozen. `resolveIamPredefinedPolicy(name)` looks one up by exact name and
has the shape the store's `resolveManagedPolicy` needs. Policies built "from
the generated lists" use `IAM_READ_ONLY_ACTIONS` and `IAM_DESTRUCTIVE_ACTIONS`.

| Policy | Kind | What it does |
| --- | --- | --- |
| `FluxIQOwnerFullAccess` | identity | `Allow *` on the workspace content and the workspace FRN, no condition, so it takes the fast path. Reaches nothing outside the workspace. |
| `FluxIQAdministratorAccess` | identity | An unconditional `Allow *` on the workspace content, and `Allow` of the `studio`, `secrets`, `gateway`, `iam` and `ops` services on the workspace FRN. No `platform:*` (platform FRNs have no workspace segment, so the content grant cannot reach them). It reaches every endpoint today's admin does, and the content grant makes it full access, so the single local owner, who is `admin` today, keeps the list fast path. |
| `FluxIQReadOnlyAccess` | identity | Exactly the 98 read-only actions, one statement per service, on the same two resources. Built from the generated list. |
| `FluxIQUserAccess` | identity | Own data: `studio`, `secrets` and `gateway` actions on resources whose owner is the principal. `Create*` of those services on the workspace FRN, and the workspace-wide lists that filter their items, named one by one (`studio:ListConversations`, `studio:Projects`, `secrets:Snapshot`), never `List*`. Self-service password, PIN, TOTP, session and vault actions on the principal's own user FRN. No `CreateUser`, `UpdateUser` or `iam:Snapshot`. |
| `FluxIQBrowserSession` | session | Allows `gateway` and `studio` in the workspace. Denies all `iam` actions, `secrets:RevealKey` and the 16 destructive actions. A connected browser acts as its user, narrowed by this. |
| `FluxIQProvisioner` | identity | For the website's provisioning identity: allows `platform:*Account*` on account FRNs; denies everything on any FRN with a workspace segment and on workspace FRNs. |
| `FluxIQServiceGuardrail` | guardrail | `Deny ops:*` and `Deny platform:*`. Keeps operator actions (including database migration and node registration) out of a hosted workspace. |

## Store

`IamStore` persists everything the evaluator needs and builds the policy set
for a principal. It is a facade over small collaborators sharing one scope
(workspace id, record access, clock, audit). Records go through
`IamRecordRepository`, a structural interface (list, get, put, delete over
envelopes) that the database manager's repositories satisfy. Only `JsonObject`
is imported from outside the directory.

| Record | Id | Holds |
| --- | --- | --- |
| `iam.policy` | `policy/<name>` | A customer policy: kind, versions, default version |
| `iam.group` | `group/<name>` | Members |
| `iam.role` | `role/<name>` | Trust policy |
| `iam.service-identity` | `service-identity/<name>` | The identity's own data |
| `iam.attachments` | `attachments/<principal FRN>` | Managed policy names attached to any principal type |
| `iam.inline` | `inline/<principal FRN>/<name>` | An inline policy |
| `iam.boundary` | `boundary/<principal FRN>` | A permission boundary name |
| `iam.guardrails` | `guardrails` | Guardrail names for the workspace |

The envelope's scope is the workspace id (null at platform level).

**Kinds are told apart by id, workspaces by the repository's scope.** The
first column is the envelope kind the store writes, but it never reads it back:
`SQLiteRepository` stores its own repository kind (`platform.iam`) over every
row's. `get` finds a record by its id, and `list(kind)` keeps the ids that are
`<kind>` or start with `<kind>/`. A workspace's rows are the ones the repository
returns for its scope (a database per workspace for SQLite); the scope a row
comes back with is not compared, because SQLite lower-cases it.
`store/tests/sqlite-iam-store.test.ts` writes every record kind over a real
SQLite repository and reads it back through a second one, with a workspace id
that has capitals.

Validation: names and path segments are checked; documents are parsed against
the grammar for their kind; predefined names are reserved and cannot be
created or deleted; a policy's kind must match its use (attached means
identity, boundary means boundary, guardrail means guardrail), checked on
write and again when resolving. Limits: 5 versions per customer policy, 20
guardrails, and a cap of 20 attached policies per principal. A policy that is
still attached cannot be deleted. Deleting a group, role or service identity
removes its attachments, inline policies and boundary. Failures are
`IamStoreError` with a closed code union.

`resolvePolicySet(principal, { assumedRole?, sessionPolicies? })` returns the
`IamPolicySet`: the principal's, its groups' and an assumed role's managed
policies (de-duplicated), inline policies named `inline:<type>/<id>/<name>`,
workspace guardrails, session policies, and the boundary. For an assumed role
the boundary is the role's own (none if the role has none; the user's is not
used). An unresolvable policy name throws, which the authorizer turns into a
deny.

Every mutation takes an `IamChangeContext` (actor FRN, origin, request id,
optional IP prefix and deciding statement) and emits one `iam-change` audit
row after a successful write. The store does not authorize; unless the caller
passes the deciding statement it cites `store`. Writes are read-modify-write
with no locking, so the caller must keep to one writer per workspace.

## Audit

`IamAuditStore` is a SQLite file (WAL mode) built to keep one row per decision
affordable.

| Table | Rows | Notes |
| --- | --- | --- |
| `dict` | Every distinct principal, action, resource list, matched statement, origin, IP prefix and non-decimal request id | Loaded into memory at open; never collected |
| `allow_YYYYMMDD` | One table per UTC day, allow decisions | All integer columns, created lazily, no secondary index |
| `long` | Denies and IAM changes | Category column (deny or iam-change), index on time |

Rows are compact because strings are interned: an allow row measured about 30
bytes (29.9 over 10,000 polling-like rows). A request id that is a canonical
decimal number (no leading zero, at most 15 digits) is stored as that integer;
any other id, such as a UUID, is interned and stored as a negative dictionary
id. This is lossless but costs a dictionary row per request, far above 30
bytes, so callers that want the compact path issue decimal ids.

`BufferedIamAuditSink` sits in front of the store. `record()` never awaits or
throws. Allows flush at 100 rows or after 1 second; a deny or IAM change
flushes immediately along with any buffered allows. A crash can therefore lose
up to 1 second (and up to 100 rows) of allows, never a deny. A failed flush
requeues its rows and reports through `onError`; past 10,000 retained rows the
oldest are dropped and counted. Shutdown must call the sink's `close()` and
then the store's `close()`.

Reads (`principal`, time range, categories, limit) scan only the day tables
overlapping the range and return newest first. `expire` drops whole allow-day
tables older than the allow retention and deletes aged rows from `long`
according to its own retention. `iamIpPrefix` records a network prefix, not
the full address. `MemoryIamAuditSink` is the in-process sink for tests.

## Authorizer

`IamAuthorizer(source, sink)` is the entry point B3 will call. `source` is an
`IamPolicySource` (`resolvePolicySet` and `getRole`); `IamStore` fits.

- `authorize(principal, action, resources, context, options?)` returns an
  `IamDecision`.
- `forRequest(principal, context, options?)` resolves and compiles once and
  returns an `IamRequestAuthorizer`, so many decisions in one request pay
  once. It has `decide(action, resources)` and
  `filter(action, items, toResource, listScope)`.
- `assumeRole(caller, roleName, context, sessionPolicy?)` checks the trust
  policy, then the caller's identity policy, and returns the role principal
  with the options to use for later decisions.

It fails closed. If the store throws, a policy will not compile or the
evaluator throws, the decision is an implicit deny with its own audit row;
`authorize` does not throw for those. A throwing audit sink does propagate, as
an error and never as an allow.

Each `decide` writes exactly one audit row (category from the decision, time,
request id, principal FRN, action, resources, matched statement, origin, IP
prefix). A request id comes from the context or is generated once per request.

`filter` decides on the list's scope first. If that is allowed by the fast
path and every item is covered by it, one row is written and all items are
returned. Otherwise each item is decided and gets a row, and only allowed items
are returned. An empty list writes the single scope row.

`assumeRole` writes one deny row (action `iam:AssumeRole`, the role FRN) for an
unknown role, a missing workspace or a trust refusal. When trust allows, the
identity check records its own row. The result is a role principal
(`type: "role"`) plus `assumedRole` and session-policy options. The contract
defines no separate role-session FRN yet, so the role FRN stands in for it.

## Enforcement

Lane B3 (t803) puts the engine in front of every program endpoint and app
route.

**Declarations.** Each `registry.register` carries, beside `permission` and
`classification`:

- `action`: exactly `iamActionName(<service>, <endpoint>)`, and `accessLevel`:
  exactly `iamEndpointAccessLevel`; `register` throws on any other, so the
  catalog cannot drift from the registrations;
- `resource`: `{ types, of(request) }`, built with `endpointResource` in
  `programs/_shared/iam/` (`workspace()`, `program()`, `project()`,
  `projectChild(kind, field)`, `key()`, `schedule()`, `client()`, `user()`,
  `selfUser()`, `custom()`). It names what the handler actually scopes by: a
  create or list inside a project acts on the project, a top-level create or
  a list across the workspace on the workspace, an operator endpoint on its
  program;
- `list` (optional): for a list across the workspace, the items, each item's
  resource and how to rebuild the payload; the registry keeps only the items
  the caller may read;
- `creates` (optional): the resource a successful call created; the registry
  records the caller as its owner.

**Resources.** `describeProgramResource` turns a ref into an FRN. An id that is
not an FRN segment is encoded; a missing one is the placeholder `~` with no
owner, so a malformed request can never widen access. A project's child
(`project/<id>/flow/<id>`) is owned by its project's owner, a user FRN by that
user. Programs register owner resolvers by kind (`registerResourceOwners`):
Automation Studio for projects, Secret Keys for keys (the key's `createdBy`).
A connected client (`client`, the `gateway` FRN type `browser`) has no
resolver yet. Owners are looked up only under `service`.

**Who is asked** (`ProgramIamGate`).

| Profile | Identity | Session | Guardrail |
| --- | --- | --- | --- |
| `local`, `self-hosted` | the role's predefined policies plus `FluxIQPermissions`, allowing exactly the actions whose permission the actor holds | `FluxIQPermissionSession`, the same set | none |
| `service` | what the IAM store attaches to `user/<id>` | the permission session for a paired client only | `FluxIQServiceGuardrail` |

On `local` and `self-hosted` identity can never allow less than the actor's
permissions and the session never more, so every decision equals
`permissions.includes(permission)`, including a paired client's narrowed
permissions and an edited role. An actor holding every permission gets
`Allow *`, so the single owner keeps the full-access fast path. These sets are
compiled once and cached (256 entries; `register` clears the cache). On
`service` with no store, everything is denied. A refusal keeps today's
`authorization.forbidden` shape and, on `local`, today's wording; the PIN check
for `destructive` endpoints is unchanged.

**App routes.** `apps/web/src/lib/app-route-iam/` holds one table,
`APP_ROUTE_IAM_CONTRACTS`: each authenticated route and method has an action
(framework setup, migrate and io are `ops` actions on the program FRN
`framework`, which the guardrail denies on `service`), today's permission, and
its resources from the route parameters. `authorizeAppRoute` calls
`GlobalProgramApiRegistry.authorize`. `/api/programs/[programId]/[endpoint]`
only marks the actor's channel (`panel` or `paired-client`), because `call`
decides it. Login and logout stay unauthenticated. Route actions are not in
the generated catalog yet (see Known gaps).

**Project ownership.** `AutomationStudioProject.ownerUserId` is the owner
recorded in `<automation data dir>/ownership/projects.json` (a SQLite row
under layout v2, one transaction per change), beside the projects and outside
the runtime's own records (`programs/automation-studio/api/ownership/`). A
creator is recorded through `create-project`'s `creates`. The migration gives
an unowned project the workspace owner, or the first enabled `admin` by
creation; it is idempotent, never overwrites, and runs lazily on first lookup,
so no project is ever ownerless while an administrator exists. An id that is
not a project answers no owner.

## Catalog generator

`generateIamActionCatalog` turns endpoint registrations (program id, endpoint,
permission, classification) into the action catalog:

- The service comes from the program id: `automation-studio` is `studio`,
  `secret-keys` is `secrets`, `identity-access` is `iam`, `client-gateway` is
  `gateway`, and the seven operator programs are `ops`. The action is the
  endpoint in PascalCase (`create-project` is `studio:CreateProject`).
- The access level is an override if one exists (`iam:CreateUser` and
  `iam:UpdateUser` are `PermissionsManagement`), else `List` for `list-*`
  endpoints, else derived from the classification. An unknown program or an
  undecidable level throws.
- Registrations that map to the same action merge into one entry whose
  `sources` lists every registration, ordered by program id then endpoint.
  Merged ones must agree on access level and destructiveness or generation
  throws; more than 16 sources throws `IamCatalogSourceLimitError`.
- Resource types are `["program"]` for `ops` and `["*"]` for everything else,
  a placeholder until B3 declares real ones.

On the live registry, 236 registrations produce 230 actions. `ops:Snapshot` is
shared by the 7 operator programs (its `sources` lists all seven). 194 actions have only the default resource type. By service: 176 `studio`,
12 `iam`, 6 `secrets`, 36 `ops`, none for `gateway`, which has no
registrations.

Two checked-in lists are generated from the same data:
`IAM_READ_ONLY_ACTIONS` (98 actions whose registration needs `programs.read`)
and `IAM_DESTRUCTIVE_ACTIONS` (16: 3 `ops`, 13 `studio`; destructive or
destructive-ungated). The catalog's own `destructive` flag also counts
program-gated endpoints, so it is not the same set. Both lists feed the
predefined policies. A test compares the live registry with the checked-in
files and fails on drift. To regenerate, from `packages/fluxiq`:

```text
FLUXIQ_REGENERATE_IAM_CATALOG=1 pnpm exec vitest run src/platform/iam/catalog
```

The full catalog is written as `packages/contracts/src/iam/actions.generated.ts`
by the same regeneration command, and the same test fails when it drifts.

## Parity

`compareIamRoleParity` runs every registration against each role twice: with
today's `permissions.includes(permission)` and with the IAM engine using the
role's policies as identity policies, under both the `local` and `self-hosted`
profiles with origin `panel`. A live test runs it over the real registry.

Since B3 a second live test (`programs/_shared/tests/api-iam-parity.test.ts`)
compares at the call level: every registration through
`GlobalProgramApiRegistry.call`, for admin, viewer, a paired admin and viewer,
an edited role, an unmapped role and a `user` role, under `local` and
`self-hosted`, with and without ids in the payload, against
`permissions.includes`. The app routes have the same check in
`apps/web/src/app/api/tests/app-route-iam-parity.test.ts`. An escalation test
(`api-iam-escalation.test.ts`) runs `service` with two `FluxIQUserAccess`
users: neither reaches the other's project or its children, any operator
endpoint, `iam:Snapshot`, `CreateUser` or `UpdateUser`, or any unfiltered
action on the workspace other than a create, and each list shows only the
caller's own items.

Result: for all 236 registrations, admin and viewer have 0 mismatches
(472 pairs, 944 decisions; 340 pairs allowed and 132 refused today). The
viewer's 104 allowed registrations are the 98 read-only actions plus the six
extra registrations sharing `ops:Snapshot`. The owner policy matches admin and
takes the fast path on all 472 decisions.

The role-level check does not cover the app routes or `service`; the
call-level, route and escalation tests above do.

## Role mapping

`programs/identity-access/runtime/roles.ts` gains `ROLE_POLICY_NAMES` and
`rolePolicyNames(roleId)`: `admin` maps to `FluxIQAdministratorAccess`,
`viewer` to `FluxIQReadOnlyAccess`, `user` to `FluxIQUserAccess`. The existing
roles are unchanged and no `user` role was added to the defaults. The lookup is
own-property only, so `constructor` returns null.

## Platform store

`platform/store/` persists the platform's own records: accounts, workspaces,
memberships, one-time link tokens and idempotency answers. The `PlatformStore`
type in `store/types.ts` is the port. Nothing in it caches, so a second process
over the same repository sees a write on its next read. No record ever holds a
password, a hash of one, a key, a session id or a raw link token. Writes are
last-writer-wins per record.

| Record | Id | Holds |
| --- | --- | --- |
| Account | `account/<userId>` | Email (trimmed, lower-cased, unique), display name, external id, identities, status (`active`, `disabled`, `deleted`), origin, sign-in times, a scheduled deletion |
| Workspace | `workspace/<id>` | Kind (`personal`, `organisation`, `single`), the owning account of a personal one |
| Membership | `membership/...` | Workspace, user, predefined policy names, groups, `active` or `removed` |
| Link token | `link-token/<digest>` | Purpose, account, `continueUrl`, created, expiry, used time |
| Idempotency | `idempotency/<operation>/<requestId>` | Input digest and the first response |
| Index rows | `email/<encoded email>`, `external/<encoded id>` | `{userId}`, so finding an account by email or external id is a get, not a scan |

There are two implementations of the port, and `createPlatformStore({
repository? })` picks one. With no repository it returns `MemoryPlatformStore`
(maps, cloned on the way in and out; for tests and a throwaway instance). With
one it returns `RepositoryPlatformStore` over the structural
`PlatformRecordRepository` (list, get, put and delete over envelopes, which the
database manager's repositories satisfy). The repository store writes envelope
kind `platform.<kind>` with scope `domainId: null`. `putAccount` writes the new
index rows, then the account, then removes the old index rows. A stale index row
(its account is gone or the value changed) is ignored on read, and a taken email
or external id throws `PlatformStoreConflictError`. A link token is usable when
its purpose matches, it is unused and `expiresAtMs` is in the future.
`consumeLinkToken` is serialized per process; across processes it is
last-writer-wins. `releaseLinkToken(digest, usedAtMs)` puts a token consumed at
that time back unused (false when it is gone or was used at another time), for a
redemption that failed after consuming it.

**Kinds are told apart by id prefix, not by envelope kind.** `SQLiteRepository`
writes its own repository kind over the envelope's kind, so on a real SQLite file
every row reads back with the same kind, and a filter on `platform.<kind>` finds
nothing. The platform store therefore reads by the `<kind>/` id prefix and still
writes the envelope kind for repositories that keep it.

The IAM store (`IamRecords`) does the same: it reads by the `<kind>/` id prefix
(see [Store](#store)), so `createPlatformServices` passes its IAM repository
through unwrapped. The adapter that once carried the IAM envelope kinds inside
each row's data is gone.

## Provisioning

`platform/provisioning/` is the service behind account creation. The contract
(operations, inputs, results, error codes and their HTTP statuses) is frozen in
`@fluxiq/contracts/platform`. `provisioning/types.ts` is the code-side seam:
`PlatformProvisioning.run(operation, input, caller)`, `PlatformAccountLinks` for
the welcome and reset pages, `PlatformIdentityPort` (structurally a subset of the
identity-access service) and `EmailSender`. `createPlatformServices(options)`
composes everything and returns `{ store, provisioning, links,
provisionerCaller(sourceIp?) }`. It takes the platform repository, a separate IAM
repository, the identity service, the public origin, the tenancy, an email sender
and an audit sink. The sink is required, so no default silently drops rows.

### Callers, authorisation and audit

Every call is exactly one IAM decision on a platform account FRN
(`frn:fluxiq:platform::account/<id>`), recorded with origin `provisioning`.

| Caller | Who | How it is decided |
| --- | --- | --- |
| `service-identity` | The website backend over the private listener | The IAM authorizer, against the identity's attached policies (`FluxIQProvisioner`). The identity is named `website-backend` unless configured; creating it and attaching the policy is idempotent. |
| `platform-admin` | The operator's command line | Allowed; recorded as `{policy: "platform-admin", sid: null}` |
| `in-process` | Server code that already authorised its person (the owner claim, the admin "add user", a plugin) | Allowed; recorded as `{policy: "in-process", sid: null}`, with the acting user as principal when there is one |

The evaluator denies any resource that is not a concrete FRN, so a decision
cannot be made on `account/*`. `createAccount` is decided on the id it will mint,
which becomes the user id, and a lookup by email or external id that finds nothing
is decided on `account/unresolved`.

### Transports

Over `http` a password is refused as an unknown field, `setPassword` is
`operation_unavailable`, an existing email answers `{status: "exists"}` instead of
`email_taken`, and a `userId` comes back only for `created`. In-process callers
may pass a password once and see `email_taken`. An input issue names the field
with a fixed message and never echoes a value.

### A call, in order

Parse (with the transport's schema), authorise, take the per-process queue, check
idempotency, execute. `getAccount` takes no request id, so it skips the queue and
idempotency. Only successes are stored for replay. The same `requestId` with the
same input digest (SHA-256 of the canonical input with the password removed)
replays the stored answer; with a different input it is `request_conflict`.
Because the digest leaves out the password, a `weak_password` retried with a
stronger one runs again. A refusal is a typed error. Identity access refusing to
disable, delete or demote the last enabled administrator throws
`IdentityLastAdministratorError` (code `identity.last_administrator`), which
`run` answers as `last_administrator` (409); the port matches the error's code,
never its message. Every operation decides what identity access or the policy
check could refuse before its first side effect, so a refused call leaves
sessions, connected clients, memberships, attachments and rows as they were. Any
other failure propagates as a throw, which the listener answers as
`internal_error` (500) with a generic message.

### Operations

| Operation | Behaviour |
| --- | --- |
| `createAccount` | Runs its checks first and changes nothing until they pass: policies, password (at least 12 characters), workspace, then email. Then creates the identity user (username is the email), the account, the workspace and the membership with its policies. `workspace: "new"` makes a personal workspace and calls `onWorkspaceCreated`. An external id that already names another account is `invalid_input` at `externalId`. With `sendWelcome` it mails the welcome link. |
| `sendWelcome` | By `userId` or `email`. Always answers `accepted`. An unverified active account gets a new welcome link (superseding the old one); a verified one gets the "account-exists" mail; unknown, disabled and deleted accounts get nothing. |
| `setPassword` | In-process only (the offline command line, the platform-admin, or the provisioner's service identity in-process). The operation is authorised and audited first, so it sets the password through `PlatformIdentityPort.resetPassword` with no recheck of the old credential, and it works after a restart. It then revokes the account's other sessions. An account with two-factor sign-in whose credential is sealed is `two_factor` (409), with nothing changed (see "Two-factor and PIN on a reset"). |
| `setPolicies` | Replaces a member's attached policies. The identity role is set first, from the new policies, so demoting the last enabled administrator is `last_administrator` before any attachment or membership changes. |
| `addMember` | Adds an account to an organisation workspace; `already_member` leaves its policies as they were. Needs the `organisation` entitlement, else `entitlement_required`. The identity role is set first, from every active membership plus the new one, so a demotion of the last enabled administrator is `last_administrator` before the membership is written. |
| `disableAccount`, `enableAccount` | Disabling refuses sign-in and revokes sessions and (through lane D's port) connected clients. Enabling restores sign-in; revoked clients stay revoked. |
| `deleteAccount` | `immediate`: the identity user is deleted first (so a refusal changes nothing), then its sessions and connected clients are revoked, then IAM attachments, then personal workspaces (data hook, then the row), then the store rows. `scheduled`: identity disabled first (so a refusal changes nothing), then status `deleted`, sessions and clients revoked; asking again returns the same receipt. |
| `rotateCredentials` | By scope: `sessions`, `browsers`, `password` (sends a reset link) or `all`. Reports the counts and `resetSent`. |
| `getAccount` | By exactly one of `userId`, `email`, `externalId`. Never a hash, a key or a policy's contents. |

**Scheduled deletion** waits 7 days. `runDueDeletions(nowMs?)` completes the
accounts that are due and collects failures into one `AggregateError`, so a failed
account stays scheduled for the next sweep. Nothing calls it on a timer yet.

**`forbidden_policy`.** Only predefined policies are provisionable. Whether a
policy "grants `platform:*`" is decided by the evaluator, not by reading
patterns: a policy is refused if, attached to a member of a test workspace, it
would allow any provisioning action (or workspace create or delete) on an account
FRN or on another workspace's FRN. Among the predefined policies only
`FluxIQProvisioner` matches. By the contract, `FluxIQOwnerFullAccess` is for
single tenancy only.

**Anti-enumeration.** Over HTTP an existing email answers `exists` with no id, and
Core mails the address "you already have an account". `sendWelcome` always says
`accepted` and `requestReset` always says `ok`. An email that cannot be sent is
reported, never raised, so the answer cannot reveal whether an address has an
account; `resetSent` is false when a send failed. The default report is one
`console.warn` naming the template and the error's class.

**Tenancy.** `single`: one workspace id is given at composition, and its row
(`kind: "single"`) is written the first time it is used.

**The single-tenancy workspace id is `workspace-main`** (the lead's decision,
2026-10-28; no document defined one before). `FLUXIQ_WORKSPACE_ID` overrides it,
in the web app's `getPlatformServices()` and in the offline command line alike.
Lane C, which owns workspaces, may revisit it; changing it after an instance has
data would orphan that workspace's rows, so a change needs a migration. `multi`: an existing
workspace id must name an organisation workspace (a personal one is `not_found`)
and needs the `organisation` entitlement.

**Role mapping until B3.** Identity-access still enforces roles, so each account's
`roleId` is derived from its policies: `FluxIQOwnerFullAccess` or
`FluxIQAdministratorAccess` gives `admin`, anything else `viewer`. It is refreshed
when policies change.

**Optional ports.** An absent port does nothing, so the service runs before lanes C
and D exist: `deleteWorkspaceData(workspaceId)` (lane C; called before a personal
workspace row is deleted), `onWorkspaceCreated(workspaceId)` (lane C),
`revokeConnectedClients(userId, reason)` (lane D; returns how many) and
`entitlements`.

## Welcome and reset links

A link token is 32 random bytes, base64url (43 characters). Only its SHA-256 hex
digest is stored. The token travels once, in the fragment of the emailed URL,
`<publicOrigin>/welcome#token=...` or `/reset#token=...`, so it reaches no server
log or referrer. Welcome links live 24 hours and reset links 1 hour. Issuing a link
removes the account's earlier link of that purpose. A link is single use and bound
to its purpose.

`redeemWelcome` and `redeemReset` check everything before they consume the token,
so a weak password (under 12 characters) or a disabled account leaves it usable. A
string that is not 43 base64url characters is `invalid_link` without a store read,
and unknown, used and expired tokens share that one code. Both purposes set
`emailVerifiedAtMs` if it is unset, set the password, and revoke all the account's
sessions (which also drops each session's key unlock).

The link is the authority for the new password, so it never asks for the old one.
The password is set through `PlatformIdentityPort.resetPassword`, which
works on a credential sealed before a restart (identity's plain `setPassword`
refuses one). Once the checks pass the token is reserved: it is consumed, so a
replay or a racing redemption is `invalid_link`. Once the password is set it is
recorded as one IAM allow of `platform:SetAccountPassword` on the account FRN,
with origin `provisioning`, `{policy: "welcome-link" | "reset-link", sid: null}`
and the account's user as principal (`account-link` when it has no workspace). If
setting the password, revoking the sessions or verifying the email fails, the
token is released and the error propagates, so the link works again until it
expires. A release that itself fails leaves the token used.

A welcome redemption carries the honoured `continueUrl`: a same-origin
`/connect/authorize` path, or null.

### Two-factor and PIN on a reset

These are the lead's decisions (t789-H, 2026-10-28). They cover every password that
provisioning sets through `resetPassword`: a welcome or reset link, and the
`setPassword` operation.

- **Two-factor (decided).** If an account has two-factor sign-in and its credential
  is sealed (not unlocked in this process, which is the usual state after a
  restart), the reset is refused and nothing changes. A link answers `two_factor`
  (403 on the pages) and its token is released. The operation answers `two_factor`
  (409). The authenticator secret is inside the seal, so the reset could only go
  ahead by turning two-factor off, and an emailed link or an operator command alone
  must never do that.
  - **Recovery:** a signed-in administrator resets the account from the panel
    (`identity-access` `set-password`, `setPasswordAuthorized`). That path rechecks
    the administrator's own password, PIN and two-factor first, and it leaves the
    account with two-factor off, to be set up again.
- **PIN (accepted).** A reset that replaces a sealed credential clears its PIN, as
  an administrator's reset does. PIN-gated actions then rest on the password until
  the person sets a PIN again.
- A credential unlocked in this process keeps its PIN and two-factor on any reset.

Core's own pages are in `apps/web/src/app/`.

| Route | What it does |
| --- | --- |
| `/welcome` | Reads `#token=` and clears it from the address bar at once. Asks for a password and confirmation, posts to `/welcome/submit`, then goes to the returned `continueUrl` or `/`. With no token or a bad one it shows a single message. |
| `/welcome/submit` | Refuses a cross-site request (403), requires JSON of at most 8 KiB and redeems the link. It then creates a session, unlocks the person's Secret Keys with the new password (revoking the session if that fails), records the sign-in and sets the session cookie with the login route's options. Responses are `no-store`; only codes are echoed. |
| `/reset` | With no fragment, an email form posting to `/reset/request`, which answers the same for every address ("if an account uses that address, we sent a link"). With `#token=`, a new-password form posting to `/reset/submit`, then a link to sign in. A reset does not sign the person in. |

Both modes of the reset page warn that model keys saved under the old password
cannot be opened after a reset and must be added again, because the vault is sealed
under the password. The reset email says the same.

## EmailSender

`EmailSender` is `{ kind, send(message) }`. A message is a template name, a
recipient and string variables. A failed send throws, and the caller decides what
to do (provisioning reports it and carries on). A sender must never log the
variables, because a link variable holds the token.

| Sender | Behaviour |
| --- | --- |
| `none` (`NoneEmailSender`) | Discards the message. |
| `file` (`FileEmailSender`) | Writes one JSON file per message, `<ms>-<random>.json`, mode 0600, holding the template, the recipient and the rendered text. The default outbox is `<fluxiq>/platform/outbox`. |
| memory (`MemoryEmailSender`) | A test double that keeps its messages and can fail the next send. |

`STOCK_PLATFORM_EMAIL_TEMPLATES` gives a subject and text for every
`PANEL_EMAIL_TEMPLATES` name. `renderPlatformEmail` fills `{{name}}` from the
message's own properties only, and an unknown name becomes empty text.

| Template | Variables |
| --- | --- |
| `welcome` | `displayName`, `welcomeUrl`, `expiresInHours` |
| `account-exists` | `signInUrl`, `resetUrl` (links to `/` and `/reset`; no token) |
| `password-reset` | `displayName`, `resetUrl`, `expiresInMinutes` |
| `client-connected`, `credential-reused` | `displayName`, `clientLabel`, `manageUrl` (lane D sends these) |

There is no SMTP sender yet.

## Private listener

`apps/web/src/server/provisioning-listener/` is a second, private HTTP server for
the website backend. It is separate from the panel and the client gateway.

| Setting | Meaning |
| --- | --- |
| `FLUXIQ_PROVISIONING_TOKEN_FILE` | Path of the token file. Unset or blank: the listener is off. |
| `FLUXIQ_PROVISIONING_LISTEN` | Required when on: `host:port`. The host is an IP literal, a bracketed IPv6 address or `localhost`; a service name is refused. A wildcard host such as `0.0.0.0` is accepted (for a container). |
| `FLUXIQ_PROVISIONING_ALLOWED_CIDRS` | Comma list of allowed sources. Blank means the defaults. |

**Token file.** One or two non-blank lines, trimmed. Each token is at least 32
UTF-8 bytes (a 32-byte base64url token is 43 characters). Two lines allow rotation:
add the new token as a second line, switch the website over, then remove the old
one. Only SHA-256 digests are kept in memory. On a request the file's mtime and size
are checked at most every 5 seconds and the file is re-read when either changed. A
failed reload refuses every token, logs one warning without a secret, and tries
again on the next check. Comparison is constant time against every digest.

**Allowlist.** The defaults are loopback, `10/8`, `172.16/12`, `192.168/16`,
`fc00::/7` and the IPv4-mapped forms. A custom entry that is not private, or is not
a valid CIDR, stops startup with a `ProvisioningListenerConfigError`, whose message
names the setting and never holds a token. The source is always the socket's peer
address; forwarded headers are never read. Startup also refuses the panel port
(`PORT`, default 3000) and the client gateway port (`FLUXIQ_CLIENT_GATEWAY_PORT`,
default 4777).

**A request, in order.**

| Step | Refusal |
| --- | --- |
| Source not allowed | 403 `forbidden`, before the body is read |
| Rate limit (120 per source per 60 s) | 429 `rate_limited` with `retry-after` |
| Not `POST /provisioning/<operation>` of an HTTP operation | 404 `operation_unavailable` |
| Any `Origin` header | 403 `forbidden` |
| No valid `Authorization: Bearer` | 401 `unauthorized` with `www-authenticate: Bearer` |
| Not `application/json` | 400 `invalid_input` |
| Body malformed, or over 64 KiB | 400 or 413 `invalid_input` (a body over 1 MiB closes the connection) |
| Otherwise | `provisioning.run(operation, body, provisionerCaller(peerIp))`: 200, or the contract's status for the error code |

An unexpected failure answers 500 with the contract's `internal_error` and a
generic message that says nothing of the failure or the request. Every answer carries `cache-control: no-store` and
`x-content-type-options: nosniff`, and never a cookie or CORS header. The server
sets header, request and keep-alive timeouts and a header size cap, and `close()`
drains in-flight requests (10 seconds by default) before cutting connections.

**Logging.** One line per request: `[FluxIQ] provisioning <operation|-> <status>
<code|-> <n>ms`. The operation appears only if it is a known one. No token, email,
external id, body or caller-supplied path is logged.

The product does not start the listener yet (see [Not yet wired](#not-yet-wired)).

## Command line

`fluxiq accounts <operation> [flags]` runs the same operations for an operator. The
code is in `platform/provisioning/cli/`. The entry is
`packages/fluxiq/src/platform/provisioning/cli/main.ts`, and no package `bin`
points at it yet. Flags fill the operation's input (`--email`, `--display-name`,
`--external-id`, `--user-id`, repeated `--policy`, `--workspace`, `--reason`,
`--scope`, `--mode`, `--terms-version`, `--continue-url`, `--send-welcome`,
`--request-id`), and `--json` supplies the whole input, with flags overriding it. A
mutating operation gets a random request id unless one is given. Exit codes: 0 ok,
1 a typed error or no answer, 2 usage.

The transport is chosen by environment. With both `FLUXIQ_PROVISIONING_LISTEN` and
`FLUXIQ_PROVISIONING_TOKEN_FILE` set, the command calls the running server's private
listener over HTTP with the first token in the file (a wildcard listen address
becomes loopback). With neither set, or with `--offline`, it runs in-process
against the data root (`--data-root`, else `FLUXIQ_ROOT`, else the current
directory) as `platform-admin`, and warns on stderr that the server should be
stopped. Setting only one of the two variables is a configuration error.

A password never comes from argv. It is read with `--password-stdin` or
`--password-file`, and a password inside inline `--json` is refused (`--json -`
reads the JSON from stdin). Over HTTP any input holding a password is refused
before a request, and `setPassword` answers that it needs `--offline`. A transport
failure prints one safe sentence, never a token or a body.

The offline composition uses SQLite repositories under the data root's databases
directory, the file email sender (or none with `FLUXIQ_EMAIL_SENDER=none`), a
persistent IAM audit file at `<fluxiq>/platform/iam-audit.sqlite`, the public origin
from `FLUXIQ_PUBLIC_ORIGIN` (default `http://127.0.0.1:3000`) and the
single-tenancy workspace id from `FLUXIQ_WORKSPACE_ID` (default `workspace-main`).
The web app's `getPlatformServices()`, in `provisioning-listener/platform-services.ts`,
builds the same composition once per FluxIQ instance.

## Model keys

Where a model call finds its key is now owner-aware. In
`releaseAutomationStudioSessionDeepSeekKey`:

- When the Flow names a key (`flowKeyId`), that key is used. It is refused, with a
  plain message, if it is missing, disabled, not a DeepSeek key, or stamped for
  another user.
- Otherwise the caller's own enabled DeepSeek keys are tried, newest first
  (`createdBy` equals the caller). Then come legacy keys with no owner stamp, used
  only if one of the caller's unlocks actually opens them. Another person's stamped
  key is never offered.
- `secrets:UseKey` goes through the optional `authorizeUseKey(userId, keyId)` port
  before any release; absent means allowed. If every candidate is refused, the call
  fails with a message naming `secrets:UseKey`.

The Flow's key comes from the `flowSecretKeyId({projectId, flowId})` option of the
session key provider resolver, then from the request's `llmSecretKeyId` metadata.

**Unlock resolution happens on every model call.** The caller's own session is only
the preferred one. If it was signed out, the resolver tries `unlockedSessionFor(
userId)` for another live unlock of the same person, and a paired browser resolves
the unlock that is live at message time. When nothing can open the key, the call
throws `AutomationStudioSecretsLockedError`, which carries the contract code
`secrets.locked` and the message for the instance host. The DeepSeek adapter turns
any throw from the secret lookup into a generic provider error, so the resolver
remembers a locked error per request and rethrows the typed one. The panel chat
gets the same fallback and error.

**Session revocation.** The identity-access service gained `revokeUserSessions(
userId)` (it reloads from the store first, so sessions minted by another instance
are found), `deleteUser(userId)` (removes the user, credential and sessions; refuses
the last enabled administrator) and `subscribeSessionRevocation(listener)`, plus a
`sessionRevocationSubscribers` option. `revokeSession`, `revokeUserSessions` and
`deleteUser` tell every listener the raw session id and who revoked it
(`IdentitySessionRevoker`: a user id and whether they are an administrator). A
failing listener does not stop the others and the session stays revoked.
Sessions are stored by digest only, so the service remembers the raw id of each
session it minted or was shown, in memory, pruned on expiry, never stored.

**Who may revoke.** `revokeSession(target, revoker?)` takes a raw id or, for an
administrator only, `{ digest }`: the id the snapshot lists, so no raw id ever
leaves the server. A named revoker who is not an administrator may revoke only
their own session. With no revoker (a sign-out presenting its cookie), the
revoke is announced as the session's own user; a raw id the service does not
know is announced to no one. `revokeUserSessions(userId)` and `deleteUser`
announce each session as its own user. The admin `revoke-session` endpoint
(`identity.manage`) takes exactly one of `sessionId` and `sessionDigest`, and
passes the caller as an administrator by that permission check.

**Wiring.** `createGlobalProgramRuntime` subscribes
`secretKeys.revokeSessionUnlock(sessionId, revoker)` to these revokes, so an
admin revoke, a sign-out, a reset and a deletion take the key unlock away.
`revokeSessionUnlock` drops an unlock only for the user it belongs to or an
administrator; anyone else is refused and the unlock kept, so knowing a session
id is not enough. The sign-out route no longer drops the unlock itself. Likewise
`createSessionRevealAuthorization` named with another user's session refuses
without dropping that user's unlock. The runtime also passes the resolver a
`flowSecretKeyId` lookup (it reads the Flow, so a build uses the Flow's own key)
and `instanceHost`, the host of `FLUXIQ_PUBLIC_ORIGIN` when set.

## Not yet wired

- **The registry's `iam` options** (`programs/_shared/runtime.ts`): the
  profile (lane A), the per-workspace IAM store as `source` and the audit store
  as `audit` (lane C). Until then every decision is the `local` one and no
  decision is recorded.
- **A startup refusal** of an undeclared registration under public profiles:
  only the completeness test enforces declarations.

- **`apps/web/src/lib/fluxiq.ts`** does not start or close the private listener. It
  needs a `provisioningListener` field on the runtime state, a start after the
  client gateway (a dynamic import of `server/provisioning-listener`, because that
  barrel imports this module) and a close before the gateway's.
- **No package `bin`** launches `fluxiq accounts`.
- **Routing.** Whatever gates unauthenticated visitors must allow `/welcome`,
  `/welcome/submit`, `/reset`, `/reset/request` and `/reset/submit`. No middleware
  was found at `apps/web/src`, and the existing page gating was not checked.
- No SMTP sender, no timer calling `runDueDeletions`, and no rate limit or human
  check on the welcome and reset pages.

## Known gaps

- **`FluxIQUserAccess` refuses workspace-wide reads it cannot filter.** On
  `service` a hosted user is refused the endpoints that act on the whole
  workspace without a per-item filter (the program snapshot, categories, the
  client-gateway listings, recordings across projects, signal registries) and
  the routes for pairing approval, the Studio context, trace upload (no owner
  resolver for connected clients yet) and the program directory. Each needs a
  per-item filter or a narrower resource before the hosted panel can offer it.
- **Projects created outside `create-project`** (a chat or a schedule calling
  the service directly) get the default owner, not their creator.
- **No fast path on `service`.** The guardrail's `Deny` disables the
  full-access shortcut, so every hosted list is decided item by item.
- **Routes are not in the generated catalog**, which lists endpoint sources
  only; adding them regenerates `@fluxiq/contracts`' `actions.generated.ts`.
- **Catalog resource types** stay `["*"]` and `["program"]`: the declared
  `resource.types` are not yet written to the generated catalog (same
  regeneration).
- **Generated-list policies do not re-version.** `FluxIQReadOnlyAccess` and
  `FluxIQBrowserSession` change when the lists regenerate, but stay at `v1`;
  no check enforces a bump.
- **`platform:*Account*`** in the provisioner matches the ten provisioning
  actions of the frozen contract, every one of which names `Account`.
- **Audit.** Non-decimal request ids are costly; multiple processes writing one
  audit file, and expiry over a full 90 days of data, are untested.
