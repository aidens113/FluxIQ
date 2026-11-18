# Dedicated Browser Environments

A paying customer of the hosted service can have a browser of their own: one
isolated environment per customer that no other tenant shares. In production
each environment is one isolated virtual machine. There is no staging machine,
so everything is built and tested locally, where one Docker container per
customer stands in for the virtual machine.

The code is `packages/fluxiq/src/platform/environments/` (the model, its SQLite
storage, the controller state machine, the driver port and the `fake` driver).
The source stays neutral about the web: it says *environment*, and the browser is
what a runner image puts inside one.

## Status

| Piece | State |
| --- | --- |
| Record, state machine, durable store, `fake` driver | Built, tested (t938) |
| `docker` driver, runner image `fluxiq-cloud/runner:<version>` | Later unit |
| `vm` driver | Later unit, after the docker driver |
| `local-process` driver | Later unit, for development only |
| Tenant-bound enrolment of an environment's client | Later unit, after t911 and t929 |
| Remote viewer | Mandatory before launch; later unit |
| Wiring to the panel API, the provisioning cascade and the platform barrel | Not wired |

## The record

Interface I3 of the hosted-cloud plan:

```ts
type EnvironmentRecord = {
  environmentId: string;
  accountId: string;
  workspaceId: string;
  driver: "fake" | "local-process" | "docker" | "vm";
  desired: "running" | "stopped" | "deleted";
  observed: "absent" | "partial" | "stopped" | "running" | "crashed" | "deleted";
  operationId: string;
};
```

`desired` is what the latest accepted operation asked for and `operationId`
names that operation. `observed` is the last thing the driver reported:
`partial` means an allocation failed part-way and left resources to release,
`crashed` that a running environment stopped without being asked to, and
`deleted` that a delete released everything. An environment belongs to one
account and workspace for its whole life, its deleted record included, until a
purge erases it. Its id is also the name of its container or virtual machine,
so it is held to letters, digits, `_`, `.` and `-`, at most 63 characters.

The store (`SQLiteEnvironmentStore`) follows the commerce ledger's pattern: one
JSON table, every method one `BEGIN IMMEDIATE` transaction, so the operation
ledger, the record and its account and workspace indexes commit together across
connections and processes.

## The state machine

Every operation has two steps. **Intent** records the operation and the new
`desired` state together, or refuses before anything changes. **Converge** then
asks the driver what exists and acts until that matches `desired`, and writes
the observation under the same operation id. A store write for an operation a
later one has superseded is dropped, so a slow operation never overwrites a
newer one's observation, in this process or another. Operations on one
environment run one after another in the controller's process.

| Operation | Allowed when | `desired` | Converge |
| --- | --- | --- | --- |
| `create` | no record, or a fully deleted one | `running` | allocate, then start |
| `start` | a record not being deleted | `running` | start; allocate first if its resources are gone |
| `stop` | a record not being deleted | `stopped` | stop a running or crashed environment |
| `delete` | any record; repeats harmlessly | `deleted` | release everything, then observe `deleted` |

Refusals are `EnvironmentRefusal` with a code: `environment-exists`,
`not-found`, `environment-deleted`, `owned-elsewhere`, `driver-mismatch` (a
live environment is driven by the driver that allocated it; a fully deleted one
may be created again on another), `operation-reused`, plus the authority codes
below.

**Idempotent by operation id.** The ledger is keyed by environment and
operation id. Repeating an id with the same kind, account and workspace is a
replay: nothing new is recorded, and if that operation is still the record's
latest it converges again, which finishes one a crash interrupted. A replay of
an operation a later one superseded answers the record as it stands and changes
nothing. Any other use of the id is `operation-reused`. Two concurrent creates
with one id allocate once.

**Failed allocations are cleaned up.** When `allocate` fails, the controller
releases whatever it left before reporting the failure; the record stays
`desired: running, observed: absent`, and repeating the create with the same id
tries again. If the release fails too, the failure reports both and the record
is observed `partial`; the next converge, `reconcile` included, releases the
partial resources first.

**Crashes restart.** `reconcile(environmentId)`, and `reconcileAll()` after an
engine restart, converge each environment without an actor: a crashed
environment whose desired state is `running` is started again on its existing
allocation, an interrupted stop or delete is finished, and partial resources
are released. Reconcile never allocates: an environment whose resources are
gone entirely is observed `absent` and waits for an admitted `start`, because
allocation is the one step that needs a paid entitlement. Nothing here caps
attempts or shortens a wait; a failure is recorded and reported, and the next
operation or reconcile picks up from what the driver observes.

## Authority

Allocation has one authority: the existing `CloudAdmissionService`
(`platform/commerce/runtime`). A dedicated environment is a `managed-cloud`
target with `allocation: "dedicated"` whose `targetId` is the `environmentId`,
so admission matches it against the subscription grant's `resourceIds`.
`dedicatedEnvironmentTarget()` builds that target for the server's IAM
resolver, which alone establishes that the actor's account and workspace own
the environment. `create` and `start` call `admit` every time, replays
included, and refuse unless the decision is `source: "commerce"`,
`allocation: "dedicated"` and names the same target and workspace
(`admission-refused` carries the admission's own reason; anything shared or
customer-owned is `not-dedicated`). The account the record is written under
comes from the decision, never from the request.

`stop`, `delete` and `get` allocate nothing, so they ask the same IAM resolver
the admission service was built with, and no entitlement: a lapsed subscription
can still stop and release what it holds. They refuse (`not-authorized`)
unless the resolver answers a dedicated target for this environment owned by
the caller's account and workspace. There is no second authority.

## Drivers

The port (`EnvironmentDriver`) is five idempotent calls keyed by the
environment id alone: `inspect`, `allocate` (absent to stopped; a failure may
leave partial resources), `start`, `stop` and `release` (anything to absent).
A driver stores no handle: it finds its resources again from the id, so a
restarted engine can always ask. A driver that cannot tell a crash from a stop
may report `stopped`; the controller starts both when `running` is desired.

- **`fake`**: in memory, with fault injection (`failNext`, `crash`) and a
  transition a real driver could not make throwing, so controller defects are
  loud. It backs the tests and local runs without containers.
- **`local-process`**: one runner process on the engine's machine with its
  own profile directory, for development. It isolates nothing between tenants,
  so the hosted service must refuse it in the `service` deployment mode.
- **`docker`** (interface I5): the local simulation of production. Each
  environment is one container from `fluxiq-cloud/runner:<version>` on the
  network `<project>_runners`, named `<project>-env-<environmentId>`, with one
  named volume for its profile. Every Docker resource carries
  `com.fluxiq.cloud.project=<name>`, and the driver adds
  `com.fluxiq.cloud.environment=<environmentId>` so `inspect` and `release`
  find the container and volume by label. `allocate` creates the volume and
  the container without starting it; one without the other is `partial`.
  `release` force-removes the container and then the volume. Containers run
  without host mounts or published ports, with every capability dropped,
  `no-new-privileges`, a read-only root filesystem except the profile volume,
  and memory, CPU and process limits from the plan. The runners network must
  disable traffic between containers, so one customer's environment cannot
  reach another's: each runner may reach only its tenant's gateway.
- **`vm`**: production. One virtual machine per environment, named by the
  environment id and tagged with the same two labels, with its own disk and
  network interface in a network that admits only the gateway. `allocate`
  creates the disk, interface and machine stopped; `release` deletes all
  three; any tagged resource without the complete set is `partial`. The cloud
  credentials belong to the operator's control plane, never to a tenant's
  gateway or runner.

## Tenant-bound enrolment

An environment's runner is a gateway client and must enrol as one. Today the
service routing refuses that path: the service router drops any hello carrying
an enrolment ticket (`apps/web/src/server/browser-trust/resolve-route.ts`,
line 13), and service client authorization refuses every managed-host binding
(`authorize-binding.ts`, line 6). That is correct while managed hosts are only
the single-tenant `fluxiq dev --browsers` pool ([managed hosts](./managed-hosts.md#enrolment-and-authority)).

The later unit, after t911 (runtime lease isolation, which rewrites the host
pool) and t929, makes the tenant's own gateway, the one for the environment's
workspace, mint the enrolment ticket, bound to that `workspaceId` and
`environmentId` and minted in the engine's process exactly as managed-host
tickets are. The driver receives a `takeEnrolmentTicket()` with `start` and
hands the ticket to the runner in memory only: over the container's attached
standard input for `docker`, and for `vm` over an outbound channel the
machine's agent opens to the control plane with its instance identity. Never in
argv, environment, URL, file, log or trace. The service routing then admits a
managed-host binding only when its environment record is owned by the
binding's workspace and desired `running`, and the binding's service identity
gets the restricted machine policy managed hosts already get. Stopping or
deleting the environment revokes its trust.

## Remote viewer

Mandatory before launch, built later. A person must be able to watch their
dedicated environment and take it over. The view streams from the runner to the
panel through the tenant's gateway session, authorized by the workspace's IAM
like any other gateway action; a runner never publishes a port. It is
view-only until the person takes control, every takeover is audited, and
nothing it shows is stored beyond the workspace's capture policy.

## Deletion cascade

`purgeAccount(accountId, operationId)` and `purgeWorkspace(workspaceId,
operationId)` release and then erase every environment of the account or
workspace: the record, its operation ledger and its index rows. A failure
part-way is reported for every environment that failed, which stay recorded as
`desired: deleted`, and repeating the purge with the same operation id
finishes them. Wiring, when the hosted service composes it: provisioning's
`deleteWorkspaceData` port calls `purgeWorkspace` before the workspace row is
deleted, and the commerce account's deletion calls `purgeAccount`.

## Supervised headed check

Before the docker driver is relied on, a supervised check runs it end to end on
this machine: one environment created through the controller, its runner
enrolled through its tenant's gateway, and the browser inside it driven to the
local panel's own pages (sign-in and workspace home), with the result watched
through the remote viewer, or a headed `local-process` runner until the viewer
exists. The panel's own pages are the target the lead allowed for this check,
so it needs neither a real site nor the realistic scenarios, and it makes no
model call. An agent supervises the run, and the stack, Docker and the slot it
holds are shut down after it, on failure too.
