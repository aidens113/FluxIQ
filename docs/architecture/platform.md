# Platform: The IAM Engine

`packages/fluxiq/src/platform/` holds the hosted platform's own machinery, as
distinct from the programs, flows and runtime that run inside a workspace.
Today it holds one thing: the IAM engine under `platform/iam/`. The engine
answers one question, "may this principal perform this action on these
resources?", using policy documents in the shape AWS IAM administrators
already know.

## Status

The engine is complete and tested but inert. Nothing in the running product
calls it: no program registration carries a resource or access level, no route
asks it for a decision, and no store or audit database is opened at start-up.
Every existing permission check still goes through the role's `permissions`
list in `programs/identity-access`.

Lane B3 turns it on. It adds `resource` and `accessLevel` to each endpoint
registration and calls `IamAuthorizer` before the endpoint runs. Until then
the engine is proven against today's behavior by the parity check (see
[Parity](#parity)).

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

A request names no pattern, only concrete FRNs. Until B3 declares real
resources per endpoint, no action names a specific resource, so:

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
| `FluxIQUserAccess` | identity | Own data: `studio`, `secrets` and `gateway` actions on resources whose owner is the principal. Create and list of those services on the workspace FRN. Self-service password, PIN, TOTP, session and vault actions on the principal's own user FRN. No `CreateUser`, `UpdateUser` or `iam:Snapshot`. |
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

Result: for all 236 registrations, admin and viewer have 0 mismatches
(472 pairs, 944 decisions; 340 pairs allowed and 132 refused today). The
viewer's 104 allowed registrations are the 98 read-only actions plus the six
extra registrations sharing `ops:Snapshot`. The owner policy matches admin and
takes the fast path on all 472 decisions.

It does not cover the 15 app routes, which have no catalog actions yet, nor
the service profile or other origins.

## Role mapping

`programs/identity-access/runtime/roles.ts` gains `ROLE_POLICY_NAMES` and
`rolePolicyNames(roleId)`: `admin` maps to `FluxIQAdministratorAccess`,
`viewer` to `FluxIQReadOnlyAccess`, `user` to `FluxIQUserAccess`. The existing
roles are unchanged and no `user` role was added to the defaults. The lookup is
own-property only, so `constructor` returns null.

## Known gaps

- **`FluxIQUserAccess` grants little until B3.** Every non-operator action
  evaluates against the workspace FRN, which has no owner, so own-data
  grants never match. A principal holding only this policy can create and list
  but cannot read until per-resource FRNs with owners are declared.
- **Routes.** The 15 app routes have no actions, so neither the catalog nor
  the parity check covers them.
- **Generated-list policies do not re-version.** `FluxIQReadOnlyAccess` and
  `FluxIQBrowserSession` change when the lists regenerate, but stay at `v1`;
  no check enforces a bump.
- **`platform:*Account*`** in the provisioner is a guess at future account
  action names, since no `platform` action exists yet.
- **Audit.** Non-decimal request ids are costly; multiple processes writing one
  audit file, and expiry over a full 90 days of data, are untested.
