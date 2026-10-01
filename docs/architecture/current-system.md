# Current System

FluxIQ is a public, domain-neutral automation framework written in TypeScript.
It is built as one importable framework package with a Next.js control panel
for local operators and downstream projects.

This repository must not contain domain-specific automation code. Host projects
provide domains, inputs, outputs, programs, policies, private data, and runtime
adapters through explicit registrations.

## Runtime Shape

The framework entry point is `FluxIQ` from the `fluxiq` package. A host project
creates a runtime with:

```ts
import { FluxIQ } from "fluxiq";

const fluxiq = FluxIQ.create({
  rootDir: process.cwd()
});

await fluxiq.setup();
```

The runtime owns:

- host paths and setup;
- domain registration;
- input/output adapter registration;
- global program runtime services;
- global program API registry;
- validation for domain IO requirements.

## Host Project Folders

FluxIQ layout v2 keeps runtime state sparse and separates global control-plane
ownership from importer-owned domain runtime state:

```text
.fluxiq/
  config.json
  global.sqlite
  artifacts/automation-studio/projects/<projectId>/objects/
  domains/<domainId>/
    config/
    data/
    domain.sqlite
  cache/
  logs/
  tmp/
```

Only `config.json` exists after fresh setup. Importer-authored domain programs,
adapters, nodes, inputs, and outputs live outside ignored runtime state under
the importing repository's configured source roots (by default
`domains/<domainId>/...`). The importer domain manifest controls names and
labels in the global editor; domain selection does not relocate global state.

The framework repo also has a normal `docs/` folder for authored and generated
Markdown documentation. The Docs program reads this same folder, so Git readers
and control-panel users see the same hierarchy.

## Global Programs

Global programs live under `packages/fluxiq/src/programs`. They are framework
capabilities shared by all host projects:

- Identity & Access;
- Database Manager;
- Background Tasks;
- Compute Control;
- Deployment Sync;
- Docs;
- Production Runner;
- Automation Studio.

Automation Studio is intentionally registered as a program but its full port is
planned separately. Accounts Manager and any OSRS-specific programs are not
part of this public framework.

## Data Model

Framework state should be persisted in the host project, not inside package
source. The main persistent database path is:

```text
.fluxiq/global.sqlite
```

Database Manager exposes framework stores as SQLite-backed repositories. Domain
databases are separate and belong to host projects.

Background task state is stored in the global SQLite database under the
`background.tasks` store. Writes are batched on a 10 second window to avoid
excessive database churn.

## Control Panel

Runtime Action Log scopes reads, selected details and retained callbacks to the
current project, run and command owner. Read failures have local retry controls;
page labels advance only after a confirmed response. Known mismatched run data
is rejected while existing summaries remain available. Audit export has a
synchronous pending lock and fixed retry feedback. Its serializer terminates
workers and revokes script URLs on success, error and abort; layout teardown
invalidates local completions and aborts serialization. This does not claim to
cancel an export request already issued to the server.

The local web control panel lives in `apps/web`. It uses the shared FluxIQ
runtime and exposes:

- login and session-gated access;
- 12 hour authentication sessions;
- program directory pages;
- fullscreen-capable global program workspaces;
- global alerts;
- AWS-inspired operational styling.

Production Runner guards workload launch and each active workload's advance or
cancel request against duplicate activation. Other workloads remain usable while
one is pending. Refused operations keep editable launch values and show feedback
beside the affected controls for retry. Parameter drafts belong to the effective
target type and id; changing or removing a target restores the new target's
defaults. Snapshot requests ignore older responses and completions after teardown.
Launch failure feedback belongs to the submitted target type/id, so switching
targets while a request is pending preserves the new draft and hides an old
target's error. Production and Background snapshots share Compute's visible
completion-based refresh policy. API identity changes reset foreign drafts,
operation locks and selection; captured old mutations are rejected before POST.

Background history independently refreshes only the selected task's current
50-row page. Task, status, offset and API own that request; changed queries hide
the previous rows and selected detail. Same-id detail resolves from the newest
confirmed page, and shrinking totals clamp pagination to a valid page. Confirmed
data remains with stale/retry feedback after transient failure. Mutation
acceptance is separate from snapshot confirmation: refresh requests coalesce,
and the next scheduled visible read reconciles a pre-write snapshot.

Database Manager authorizations use a synchronous submission lock and a local
retryable error inside the recheck dialog. Submitted credentials cannot change
while pending; closing or changing stores clears them and invalidates old
completions. Accepted grants require a nonempty id and a future expiry. API domain
changes clear local grants and record state, so authorization from the previous
scope cannot unlock the new workspace. Dismissing a pending dialog discards its
late receipt; it does not claim to revoke a grant already issued by the server.
Read-only database browsing has separate metadata, row and detail recovery,
with confirmed paging retained during failed navigation. API/user/query changes
and grant expiry mask obsolete data immediately; expired or revoked authority
invalidates outstanding reads. Removed metadata targets also hide their recheck
dialog and fence retained authorization callbacks before passive reconciliation.
An explicit metadata Refresh rereads the existing snapshot endpoint. These are
frontend presentation guards; backend authorization remains authoritative.

Initial password/TOTP sign-in and temporary-credential replacement return to
the actual requested local path, query and fragment. A local destination
validator rejects external authorities and ambiguous encoded separators;
arbitrary query return paths are data. Protected setup and program routes show
the inline login gate before loading program state. Old request responses are
ignored after route changes, while explicit retry uses the current destination.
Sign-out prevents duplicate submission and keeps the workspace open on HTTP
refusal or transport failure, with local retry feedback. Navigation follows only
an acknowledged successful response; obsolete responses after the status control
unmounts cannot navigate. An issued server sign-out is not cancellable by that
local response fence.
Legacy domain-program aliases preserve available scalar and repeated query
values while using the path-owned domain id exactly once. Server redirects
cannot preserve a fragment they never receive. Launcher recent-history writes
are optional: storage denial does not throw through the Link click callback,
and the in-memory recent list retains its existing six-entry bound.

Revealed Secret Keys, manual TOTP keys, source viewers, selected Inspector IDs
and expanded raw state JSON use a shared clipboard control. It
waits for the browser write acknowledgement before showing success, prevents
duplicate pending writes and offers manual-copy guidance when access is missing
or refused. Changed values, closed reveals and unmounted controls ignore late
feedback. Raw JSON still serializes only while expanded; changing its state
source/phase or collapsing it discards copy feedback. Source search, wrapping
and download remain usable during a pending copy. Reveal expiry remains
unchanged; an issued clipboard write cannot be
cancelled and closing the reveal does not clear the system clipboard.

Compute Control resolves selected detail and activity from the visible filtered
nodes. Search, health or capability changes choose a visible fallback or clear
the selection when nothing matches; hidden nodes do not retain their detail.
Its operational snapshot refreshes ten seconds after each completed visible
read, coalesces refresh requests and aborts/pauses while hidden. Failed reads
retain confirmed data with freshness feedback and capped backoff; permission
denial pauses automatic retries until manual recovery. Owner changes invalidate
old reads and callbacks. Heartbeat health remains a sampled estimate using the
existing thresholds, rather than a claim about current server health.

Automation Studio's Problems view distinguishes remote loading, access denial,
failed queries and successful empty results. Previous-query rows are labelled
stale while replacement results are pending or failed, and retry retains the
requested page. Project/filter changes and teardown invalidate old responses.
The Steps start pane passes proposal navigation to blank-flow authoring and
existing-flow improvement. Successful generation retains a Review suggested
change action; generated changes require review, and late responses after a
project/flow change or teardown cannot navigate or publish into the new scope.

Selected run actions and events identify retained summary data while full detail
loads, show failure feedback and provide a separate retry. Changing action pages,
selection or run scope, closing detail, and teardown invalidate obsolete detail
requests; a late response cannot reopen the previous selection.

Outside Studio, global questions scan bounded conversation candidates and forward
turn pages, continuing long threads across polls. Idle or dismissed threads do
not hide other waiting questions, and stale answer/dismiss handlers cannot affect
a newer question. Read failures and the current summary-list limit are visible
with a link to review conversations in Studio; no complete-discovery claim is
made beyond the existing API's returned conversation window.

The program directory links to Get started. Guided Studio entries accept only a
single describe, demonstrate or extract start choice and preserve the domain
scope. The journey stays passive until the person chooses a project and an
explicit next action; canonical flow/subflow/view/detail links take precedence.
Only the current entry can consume its start parameter. Dismissal preserves the
mounted workspace and its state; recording and extraction still belong to the
connected browser and extension.

Runtime has a read-only workspace over the existing global snapshot and get-run
endpoints. It displays clients, capability entries, runs, observed dispatch paths
and transports/adapters with client-side pages and explicit snapshot time,
refresh, stale and retry states. Selected run details load separately and reject
obsolete or mismatched replies. Display projection retains structural fields and
omits arbitrary metadata, command parameters, results, traces and error prose.
The existing API still returns the full global inventory: frontend projection
and paging do not provide server pagination or reduce sensitive data on the wire.

Authenticated routes share one session-recovery host in the root layout. When a
program API request receives HTTP 401, it can ask the person to sign in again
without replacing the current workspace or its unsaved edits. Successful recovery
retries the interrupted request once; cancellation or host teardown settles the
pending recovery instead of leaving requests waiting indefinitely. The host owns
its login form and ignores responses arriving after it unmounts.

The Automation Studio chat composer stays editable while a message is being
sent. A successful send clears only the unchanged submitted draft; later edits
remain available for the next message, including edits back to identical text.

The panel must be run manually by the user:

```bash
pnpm --filter @fluxiq/web dev
```

## Domains And IO

Domains are provided by importing repositories. A domain declares what FluxIQ
can observe and what FluxIQ can affect:

- inputs describe readable or streamable state, observations, telemetry, or
  action intents;
- outputs describe named, dispatchable effects and their safety contract;
- adapters implement those surfaces at runtime.

Automation must go through declared inputs and outputs. Framework code should
not reach into private domain files or hidden global state.

An action input can explicitly link to an output by ID. Its importer-owned
payload mapper turns the recorded observation into the output payload. Such an
input is recording evidence only: it cannot become a state condition in a
generated policy. Automation Studio proposes executable nodes only from these
registered output bindings; all other inputs remain state or non-executable
evidence.
## Workspace scopes

The web panel has a global workspace at `/` and a workspace for each registered
domain at `/domains/:domainId`. The global workspace lists domains alongside the
global program catalog. A domain workspace has a back link to that global grid
and presents the same global programs in an explicit domain context. Program API
calls carry that context as `domainId`; global pages carry no domain ID.

Global Automation Studio projects and flows remain domain-neutral (`domainId:
null`). Projects, project categories, and newly created recordings are scoped by
the active domain ID; global and domain project lists are filtered at the
program API boundary. Legacy projects are treated as global unless their stored
recordings unambiguously identify one domain. Cross-domain orchestration is an
intentional next runtime contract: it must invoke explicitly registered domain
routines rather than treating a domain output as globally executable.
