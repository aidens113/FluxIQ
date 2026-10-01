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

Production Runner prepares primitive parameters through an explicit local form
policy: required values, typed defaults/enums and inclusive numeric bounds.
Unsupported declarations and forms over 30 fields block Start with correction
feedback; they cannot silently submit partial metadata. Optional numeric blanks
are omitted and explicit zero remains zero. Same-target edits survive refresh.
This limited frontend policy does not replace backend validation or claim full
JSON Schema support; absent schema is allowed and declared null is invalid.

Deployment Sync owns reads, action locks and captured confirmations per API
workspace. Confirmation retains the chosen target/version and rejects removed
metadata or obsolete callbacks. Acknowledged actions remain visible when their
snapshot confirmation fails; Retry reads state without replaying a mutation.
Absent or unavailable Git state is shown as unknown, never as a clean checkout.

Docs separates confirmed metadata, selected-page reads and explicit rebuilds.
API replacement clears prior workspace presentation; same-owner refresh retains
valid selection and drafts. Successful rebuild reloads the selected page even
when its ID is unchanged, and removed selection reconciles to current metadata.
Page Retry reads directly; missing indexed pages also offer explicit Rebuild.
Local rebuild acknowledgement stays visible alongside later page-read errors.

Docs tree selection and keyboard focus are independent. Explicit folder choices
survive equivalent metadata and filtering; a new selected page reveals its
ancestors once. Navigation mounts the current viewport/overscan window plus at
most one retained keyboard entry, and clamps the range when a tree shrinks.
Deferred focus requires the latest intent, current tree/lifetime and an active
visible document whose source control still owns focus. Passive updates do not
claim focus. Sibling positions are derived once for the complete flattened tree;
virtualization retains all indexed pages and existing history/sandbox behavior.

Identity Access scopes dialogs and proof fields to the current API and acting
user. Credential and authenticator steps retain their captured subject instead
of following a changed list selection; obsolete dialog callbacks cannot issue
or publish into a replacement workspace. Factor-policy changes clear prior
proof fields. Explicit read failures retain confirmed same-owner metadata and
offer Retry, while acknowledged writes have persistent local feedback separate
from snapshot confirmation. Existing authorization and final-admin rules remain
server-owned; the UI retains its operation lock and busy-dialog behavior.

Secret Keys isolates API, automation catalog and actor workspaces. Dialog proof
and revealed values are tied to current factor policy, exact dialog instance,
selected key and confirmed key version; replacement or rotation masks stale
values during render. Reveal clears its proof fields and expires after 30 seconds
without letting an earlier equal-valued instance close a newer dialog. Lazy scope
choices validate used metadata, provide explicit read Retry and order repeated
project selections by request generation. Writes retain local acknowledgement
when metadata confirmation fails. Existing authorization, busy-dialog and
clipboard contracts remain intact; already issued server writes are not cancelled.

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

Onboarding masks readings from replaced source owners during the first render.
Gateway and key checks settle independently, validate consumed metadata and use
fixed feedback for injected exceptions while preserving fulfilled endpoint
refusals. Manual checks coalesce with pending reads; unfinished automatic checks
wait for completion and pause while hidden. Complete checklists stop automatic
polling and retain manual refresh. Domain-aware Get started setup links preserve
the encoded domain on the fixed Secret Keys route. Entry/view/router callbacks
are scoped to current render ownership and layout lifetime without remounting
the existing guided workspace or replaying navigation.

Compute, Background and Production validate directly rendered records/scalars
before publishing a snapshot or history page. Malformed successful responses
use the existing recoverable read channel and retain confirmed content/drafts.
Arbitrary private metadata/results are not traversed; Production's parameter
policy remains separate. Acknowledged Background runs with malformed returned
detail keep acceptance feedback and withhold unsafe selection, then reconcile
through ordinary reads; they are never automatically submitted again.

Modal quick-submit handles only plain unhandled noncomposing Enter from a
focused eligible owned single-line text input outside a native form. Cancel,
Close, links, selects, other native controls and another overlay retain their
native activation; busy or unavailable confirmations cannot be triggered by
the convenience handler. Initial dialog focus selects eligible explicit
autofocus before ordinary content inputs and controls, then falls back to the
panel. Hidden/inert/effectively disabled candidates are skipped and environment
acquisition uses the panel's owner document. Shared stack/trap/return and
authorization readiness contracts remain unchanged.

Menu keyboard entry chooses the first/last eligible item for ArrowDown/ArrowUp;
current items use one roving tab stop and native Enter/Space activation. Disabled
navigation options expose non-link menu items. Current option/lifetime guards
retire removed callbacks. Tab closes from the trigger as its native departure
point without preventing traversal, while action/outside/teardown suppress old
trigger restoration. Shared capture ignores handled/composing/modified Escape
and stale keyboard targets. Tab uses current visible, effectively enabled
sequential candidates, with owned panel/invalid-position fallback; unrelated
outside focus remains with its owner. Return focus requires an interactive
document, eligible target and closing-overlay focus ownership, while minimal
connected focus proxies retain their original contract. Stack, isolation,
scroll locking and listener restoration remain unchanged.
Database record tables identify their selected database/kind and column headers
semantically, preserving all record requests and authorization behavior.

Combobox options become unavailable immediately when disabled. Retired option
and input callbacks cannot change a replacement control; current selection
closes once. First ArrowDown enters the first filtered option and ArrowUp the
last; composition, handled events and modifier shortcuts retain native input
behavior. Field labels, controls and help/error messages share the child's
existing ID when present, preserving caller description and validation attributes.

Detailed database JSON formats only while its native disclosure is open, reuses
unchanged data during clock/presentation updates and is discarded when closed.
It retains the full record rather than a bounded preview. A changed record,
query, owner or viewing grant closes the disclosure and retires old toggles;
expired grants cannot reopen it through a retained callback. Floating workspace
overlays use their panel's owner document for entry focus, selecting eligible
explicit autofocus before ordinary controls and the panel fallback. Hidden,
unfocused or retired panels do not claim entry focus.

Floating workspace cancellation returns focus only to an eligible original
trigger. Outside dismissal, accepted actions and retired requests suppress that
return; synchronous pending guards prevent duplicate actions before busy renders.
Current failures remain retryable and issued actions retain their original
completion semantics. Tooltip hover and focus have independent lifetimes;
eligible Escape dismisses supplemental text until both leave, preserves native
child handlers and does not consume the event. A parent overlay may also handle
that Escape. Visible text supports pointer travel through its local gap bridge;
physical browser geometry remains unverified.

Bounded JSON previews disclose truncation for long strings as well as collection,
depth and item limits, retaining lazy disclosure. Database full-record JSON is a
separate capability. Code downloads release allocated object URLs even when
anchor creation, configuration or activation fails; existing failure feedback
remains available. A started download acknowledgement does not prove completion.

Data Flow Inspector distinguishes an unconfirmed read, loading, confirmed empty
and last-confirmed samples after failure. Read recovery and cache-clear feedback
remain separate; a clear acknowledgement reports only acknowledgement, while an
unconfirmed request may have completed. Explicit refresh never replays a clear.
API/project UI ownership and synchronous operation locks retire stale callbacks
without cancelling issued mutations or claiming backend project isolation.
Settings section scroll frames use current navigation props and reject retired
work. Cancelled initial scrolling reschedules the current selection; completed
initialization remains once per mounted layout.

Runtime has a read-only workspace over the existing global snapshot and get-run
endpoints. It displays clients, capability entries, runs, observed dispatch paths
and transports/adapters with client-side pages and explicit snapshot time,
refresh, stale and retry states. Selected run details load separately and reject
obsolete or mismatched replies. Display projection retains structural fields and
omits arbitrary metadata, command parameters, results, traces and error prose.
The existing API still returns the full global inventory: frontend projection
and paging do not provide server pagination or reduce sensitive data on the wire.

Hierarchy create and delete dialogs lock editing, navigation and dismissal while
a request is pending. Retired handlers cannot submit a replacement transaction;
issued work settles its original store only while the same transaction remains
pending. Failures retain the draft and show a local alert; an unconfirmed outcome
asks the user to check the hierarchy before explicitly retrying.

Both hierarchy and shared Tree keyboard handlers accept plain, unhandled keys
from the focused treeitem. Nested native controls keep their keyboard behavior,
and child keyboard or focus events do not operate ancestor rows. Composition
and modified shortcuts leave the event untouched.

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
