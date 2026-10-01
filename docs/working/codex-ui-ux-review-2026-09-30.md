# Core UI/UX review and initial fixes

Status: Active
Status detail: Twelfth source verified; hierarchy dialog, ProjectTree and shared Tree event ownership implementations active; original full failures preserved.
Created: 2026-09-30
Last updated: 2026-10-01
Owner: Codex senior supervisor
Scope: Core web shell, operational panels and Automation Studio user journeys; paired extension review and draft-preservation fixes.
Paired document: codex-ui-ux-review-2026-09-30.md in the sibling downstream repository.
Related: [current system](../architecture/current-system.md), [working document index](./README.md)

## Current State

Continuous Core UI execution is Active in isolated paired task t224. Claude
owns integration; root does not merge/push or edit protected runtime/storage/
conversation/context-packet implementations. No live/browser/Lab/provider/
panel management or actual private-data access is authorized.

Three workers own disjoint Core units; no broad Core gates during their writes:
- Hierarchy dialog/reducer +NEW recovery test: pending locks and captured-store
  issued settlement implemented; local visible feedback/StrictMode correction
  active, source not yet accepted by root.
- Hierarchy ProjectTree +NEW keyboard ownership test: corrected baseline22fail/
  3pass, local direct-treeitem guard implemented; owning/types pending.
- Generic shared Tree +NEW event ownership test: source-confirmed nested
  keyboard/focus leakage; tests-first baseline queued, original source unchanged.
Downstream paired reports hold exact briefs; claims require independent review.

Latest verified Core source:1d4d2000 CodeViewer cleanup,91a29dd2 Tooltip/floating
close/JsonViewer guidance,b1dfc40e DataInspector/settings navigation. Root owning
checks19/55/139/79 passed; nine-root and four-root actual-config strict0.
Twelfth full31117 FAILED:350files2807pass3fail/358.11s (old login/flow.create).
Types65532 native0/127109ms; build34521 native0/286125ms/17pages. Structure46579
only inherited protected4506/4505, unchanged and unwaived.
Unchanged focused31353 FAILED67pass1fail/152.34s:login8 and flow.create pass,
recording.delete[several] returns synthetic-fixture EPERM. Root reviewed relevant
test/world/argument source:unique physical roots, awaited public lifecycle and
one-ID bulk variant; no fixture cause confirmed. Protected deletion/service
quiescence handoff remains open. No refusal/assertion/timeout relaxation.

Eleventh accepted integrated Core gate:344files2706/native0,types/build0,
structure only protected violations. Prior evidence remains in paired reports.
Original Claude workload t216/t217/t219/t220/t221 is complete and handed off in
t221 de2096b1. Read-only main history shows Claude round6 integratedb1dfc40e at
Corec9518f84 and downstream1884e5e2 at2d269cd7. Root did not observe round6
validation. Main Core was clean; downstream task-tool edits left untouched.

The downstream document owns browser-contract details and gate results. Latest
extension source3a55a8b1 AskControls and28ee7f6a lazy completion independently
passed54/48 tests and scoped types0. Extension full45050/build93194 pending,
source frozen; original full failure remains recorded. Receiver/start/preview
plans are held for subsequent explicit file-partitioned releases.

Next: source/test review and independent owning checks for all three Core units;
update authored documentation, then integrated checks after source freeze.
Never substitute narrow success for original full failures or browser proof.
Latest paired progress checkpoints Core5eec244e/6e13961f and downstreama09bef0e/
220dc1a4/f93a8e1f/14a84cea. Root has made no merge or push.
Superseded Current State preserved verbatim in
[the checkpoint archive](./codex-ui-ux-review-2026-09-30/archive/2026-10-01-before-core-tree-current-state.md).

## Work Ledger

### 2026-10-01 - Current State consolidated before Core tree units
- Agent: supervisor
- Changed: paired Current State and verbatim archive; full record owned downstream under same dated ledger title
- Validation: exact archive comparison and Current State line budget
- Outcome: Accepted
- Follow-up: finish three Core units and observe downstream gates


### 2026-10-01 - Twelfth narrow verification and continued workers
- Agent: supervisor and three workers
- Changed: Tooltip interaction, floating close intent, CodeViewer cleanup, JsonViewer guidance and authored architecture; two disjoint recovery briefs released downstream.
- Why: keep cancellation/focus and read feedback consistent while preventing stale callbacks from affecting replacement UI.
- Validation: independent floating139/native0/22.78s; combined Tooltip/JsonViewer/download/shared55/native0/4.58s; CodeViewer19/scoped0 previously checkpointed1d4d2000. Nine-root strict83805 pending. JsonViewer tests-first3fail/4pass retained downstream.
- Outcome: Focused source reviewed; DataInspector and settings workers continue. No Core broad gates while workers write, no browser certification or integration push.
- Follow-up: observe strict result, checkpoint frozen units and review recovery implementations before full Core gates.

### 2026-10-01 - Tenth Core corrected full gates complete
- Agent: supervisor
- Changed: environment2d9306b6/login a466c972, validation records and next exact worker briefs downstream.
- Why: resolve the observed lock failure and verify integrated UI behavior before further native-control fixes.
- Validation: full61471 native0,340files2629tests/194.11s; types50626 native0/95150ms; build45474 native0/202003ms. Final structure only protected4506/4505 after comment-only cleanup rationale reconciliation; no baseline relaxation.
- Outcome: Tenth Core accepted and locally checkpointed; original failed full gate remains documented. No merge/push/private/live operations.
- Follow-up: disjoint Combobox and Field workers implement source-confirmed audit findings. Downstream shell independent60/scoped0 and extraction102/scoped0, full extension gates active.

### 2026-10-01 - Tenth Menu verified; full failure preserved
- Agent: supervisor
- Changed: local687ddc58 Menu keyboard recovery and database table semantics; authored architecture.
- Why: preserve completed UI work while tracing a real existing concurrency failure.
- Validation: independent Menu130/native0/2.62s and database25/native0/8.70s. Core types59550/native0/96912ms; build36861/native0/209084ms. Full46495 native1:2547pass/1EPERM login-lock test failure/196.07s. Structure11002 native1 only protected4506/4505.
- Outcome: Narrow UI accepted and checkpointed; tenth broad test certification incomplete, no merge/push.
- Follow-up: exact shared environment two-path worker now active; login-lock worker read-only diagnosis. Downstream root verifies frozen Chat and continues receipt/control integration; three worker slots assigned.

### 2026-09-30 - Final initial-batch handoff
- Agent: supervisor
- Changed: final current state and integration/resume record.
- Why: checkpoint verified behavior without claiming queued redesigns or live validation.
- Validation: independently observed full web287files/1704tests0, web types0,
  production build0. Core audit1 solely inherited unchanged service4506/4505.
- Outcome: Complete for current-source audit and initial recovery/composer batch.
- Follow-up: Claude owns integration; no merge/push. Preserve root-only recovery
  host, owning tests, composer edit revisions and public-default contract fixture.
  Code commits e6eb33f2/95573296; prior record07acd910. Paired extension
  commits21e915ee/061e8a70. Remaining UX phases and live validation stay queued.

### 2026-09-30 — Paired UX review initiated
- Agent: supervisor
- Changed: this task record; product changes underway in web app auth composition.
- Why: user requested primary attention to UI/UX and functional task completion.
- Validation: source review only; tests pending.
- Outcome: Partial
- Follow-up: inspect worker results and run independent checks.

### 2026-09-30 — Initial recovery verification
- Agent: supervisor and worker
- Changed: app/session-reauthentication host, root composition, owning tests and current-system documentation.
- Why: make every authenticated panel recover expired API requests while preserving work.
- Validation: focused17/17, web tsc0, supervisor productionbuild0; full audit only inherited service4506/4505. Broader web suite88597 pending.
- Outcome: Partial
- Follow-up: checkpoint locally, observe broad suite, preserve Claude integration ownership.

### 2026-09-30 - Scoped follow-ups verified; final checks running
- Agent: supervisor and fixture worker
- Changed: Core composer edit-revision guard and four owning regressions; contract fixture uses published provider token defaults. Runtime code, scripted responses, assertions and other budgets unchanged.
- Why: preserve newer Core chat drafts and align the test fixture with the current public context window.
- Validation: supervisor reproduced two composer failures (2fail/8pass), then observed corrected10/10 exit0. Inspected worker raw contract completion60/60 exit0 and exact fixture diff. git diff --check0.
- Outcome: Partial
- Follow-up: root full web tests session98054 and web typecheck62339; source frozen. Production build and final documentation checks follow. Initial checkpoints Coree6eb33f2/downstream21e915ee remain recoverable. Claude integration ownership unchanged.


Final documentation verification: supervisor session48994 exit0, docs-links and working-docs passed (0warnings/16baselined). Final records/index checkpointed locally; no merge or push.
