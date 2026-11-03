# Runtime Ownership Refactor: Reset Plan

Status: Superseded
Status detail: Replaced on 2026-11-02 by studio-controller-plan.md on task t845, which restarts the moves from dev with a path-only tool. Kept as the record of t843; do not resume from it.
Created: 2026-11-02
Last updated: 2026-11-02
Owner: Senior supervisor
Scope: Establish finite ownership migrations and acceptance for Core, downstream web boundaries and the subsequent reusable chat package.
Paired document: ../!FluxIQWebExtension/docs/working/runtime-ownership-reset-plan.md
Related: [existing record](runtime-ownership-refactor.md), [remaining owner inventory](runtime-ownership-refactor/reports/remaining-backend-owner-map.md)

## Current State

**Superseded 2026-11-02.** Measured against dev: Studio implementation fell from 120,705 to 111,870 lines (7%), while 242 non-test files outside the execution-admission system came to depend on it. The composed test `project-build-trial-reset` ("runs each trial on the site") passes on dev in 2.5 s of test time and does not on this tree. The user restated the goals as: move runtime logic out of Automation Studio, make Studio a controller of Core, and put the extension's chat UI in its own package. Admission is not among them. The admission system and its guards stay unmerged on this branch. Everything below is the historical record of t843.

The user authorized execution on 2026-11-02 ("Ok follow the plan"). The implementation freeze is lifted for this plan. The completed salvage audit remains evidence for selective retention; do not discard the preserved source wholesale.
First SQL and callback batches passed public-package integration. Complete rich Flow/session/evidence contracts, transaction-local proof reuse and admission SQL ownership are now implemented; exact evidence and held checks are in the ledger below. Remaining callback/environment guards and real router observation entry run as disjoint worker units. Original composed positive remains unverified after the bounded diagnostic. Root owns shared documents, integration, final verification and public export coordination.
The next source window is frozen: complete rich routing/state owners, full tool prerequisites and P2 actual tool observer/forwarders are implemented. Lead independently verified routing18-declaration/37-unrelated-declaration parity and tool19-declaration/22-alias parity. P2 outside18-file/19-specifier retargeting is applied with exact inverse-byte proof. Callback/clock/environment/proxy guards and their regressions are saved; combined compiler/structure/owner behavior checks are next. No further migration source is released until these readers finish.
No paid/browser/panel run is started. Package-wide readers wait for a coherent frozen tree; workers may run stable owner-local tests.
User additionally requested the fastest safe execution on 2026-11-02. Root owns the parallel [time-reduction investigation](runtime-ownership-reset-plan/reports/time-reduction.md); it may reduce redundant collection/builds and dependency waits but cannot weaken acceptance. Retained budget/unknown-frame small unit: 17 tests passed, two-root strict closure zero diagnostics/program edges, scoped structure 19 files zero failures.
Authoring pair: C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ and sibling !FluxIQWebExtension, task/t843-runtime-foundations. The IDE's t842 document is an older checkout.
Latest pushed checkpoints: Core bfd3ee47e, downstream ef842b99. They are partial task backups; dev/main have not advanced for this unit. New source batches remain local while combined gates wait for a coherent frozen tree.
At the foundation checkpoint Core typecheck/structure passed, normal public-package downstream domain check/build passed, all82 selected domain cases passed, extension check/build passed. The bounded composed witness drained all177 store entries and progressed beyond the earlier wait, but was intentionally cancelled and is not complete-runtime acceptance. No fixed SQL/FIFO deadlock or exact stall cause was established.
Current SQL foundation and first callback-adapter batch passed focused lead tests, package typecheck and full structure. Normal Core public package rebuilt; emitted server import preserves constructor/migration identity and exposes all 30 original migration definitions. Remaining adapter groups, five isolated model-log contracts and composed acceptance remain unfinished; do not treat this as complete ownership or release acceptance.
The previous 1–3 day estimate was not derived from scheduled work units. It is not a delivery commitment. This plan must be reconciled into owned migration batches before a replacement estimate.

## Required Outcome

1. Automation Studio contains UI/view state, program registration and genuinely thin framework control adapters. It owns no execution, authoring, verification, persistence or orchestration implementation/state.
2. Generic backend capabilities have canonical framework owners and public seams. Legacy paths are identity-preserving aliases; importing a canonical owner cannot reach Studio, including erased types.
3. Active DOM/browser/selector/URL semantics live downstream. Core accepts neutral data and explicit trusted domain ports. Passive compatibility fields are not active interpretation.
4. After both ownership audits pass, move the actual extension chat rendering/data/styles into a reusable Core UI package and integrate the extension plus a second real client.

## Why The Previous Execution Failed

The supervisor reported prerequisite progress as proximity to completion, without first closing the remaining-owner inventory. Runtime defects and new completion mechanisms expanded the critical path without an updated task schedule. Repeated broad composed diagnostics consumed time while many straightforward ownership moves remained queued. Paired compatibility/source/build checks were often deferred until large batches accumulated. These were execution/planning errors, not new user requirements.

## Execution Contract For Review

- Make bounded feature moves preserving existing behavior, state identity, SQL bytes and public contracts. Complete all local consumers and old aliases in that batch.
- Do not silently combine a move with cleanup, new completion machinery, broader security behavior or unrelated fixes. Name each real defect, its reproduction, necessity and acceptance separately. Known relevant defects remain release gates; discovery does not open an unlimited workstream.
- Each worker gets exact owned paths, stable input/output interfaces and a finite acceptance list. Root owns integration. No overlapping file writers.
- Close and integrate a batch before extending its scope. A newly found dependency becomes an explicit plan revision with its impact stated.
- Run the changed owner's tests/typecheck and structure gate. Use the documented public-package rebuild at cross-repository boundaries. Reserve broad composed readers for frozen dependency closures.
- No repeated five-minute timeout run without a new phase witness and a specific falsifiable cause. Isolate the waiting operation and use a bounded regression before rerunning the whole composed case.
- Report completed ownership batches, remaining batches and actual blockers. Do not equate test counts, copied files or task backups with overall completion.

## Ordered Milestones

| Milestone | Concrete work | Exit evidence |
| --- | --- | --- |
| 0. Reconcile frozen work | Review each partial report against saved files; decide retain/complete/restore per unit; record the last passing and current failing gates separately. No code during this planning step. | Exact WIP disposition and next batch; no lost changes or unreported process. |
| 1. Lock ownership batches | Use existing A–N inventory; classify each remaining module as UI/view, thin adapter, compatibility alias, framework implementation or downstream implementation. Freeze destination/dependency/public-export manifest per batch. | Every remaining implementation has an owner and batch; no uncategorized backend exemption. |
| 2. Contracts and persistence foundation | Finish complete rich contracts and the already mechanically moved project SQL/schema/default migration owner, retaining sole pool/cache/lease/migration state. Keep cleanup behavior corrections as named defect units. | Canonical source/type closure excludes Studio; original migration/SQL identity and existing database/schema/UOW tests pass; public server seam works. |
| 3. Remaining backend owners | Run the file-partitioned lanes below, honoring their explicit dependencies. Move actual bodies and state; remove convenient reverse imports rather than hiding them behind aliases. | Each batch's canonical closure, alias identity, touched behavior and public seam pass before dependent batches start. |
| 4. Panel-only and web boundary closure | Move remaining service composition and endpoint backend collaborators; retain thin controls. Audit all active browser interpretation and real extension consumers, including testing code. | Mechanical checks fail on forbidden dependency direction/backend ownership/browser imports; real representative execution/recording/authoring tests pass. |
| 5. Shared chat package | Extract actual widget, stream view models, rendering and styles; browser-specific permissions/routing stay in adapters. Integrate extension and a second real client. | Streaming, actions, cancellation/questions, accessibility and browser-safe standalone build demonstrated for both clients. |
| 6. Paired integration | Update authored architecture, merge coherent units under each repo's rules; run permitted full sweeps and promote only fully passing paired commits. | Both dev branches synchronized; main only after required full gates. No task-backup-as-release claim. |

## Remaining Backend Lanes

The existing inventory's1,815 runtime-declaration modules include constants, schemas and composition facades; they are not1,815 independent algorithms. Do not use that count as an ETA.

| Lane | Inventory groups / original responsibilities | Dependencies |
| --- | --- | --- |
| Persistence and durable state | B: project stores, admission persistence, objects, graph/run/dataset/recording streams and indexes; M's ownership/document persistence. | Milestone2 rich contracts/SQL; preserve one original state authority. |
| Models and interaction | E: remaining model configuration, evidence/tool actors and logging; D: conversations, parking, activity. | Canonical records; conversation persistence waits SQL; native log uses existing stable native helpers. |
| Authoring and execution control | C: configured cohort/tools; F: authoring/reset/version; G: trial/checkouts; H: verification/scheduling; J: project-agent orchestration. | Freeze shared F/G/H contracts together; actual persistence before admission-dependent actors. |
| Follow-on feature batches | I: change/recovery/training; K: trace/recording/proposals; remaining A: artifacts/envelopes; N: generic testing support. | Run independent batches as a lane becomes free; change waits required verification/history, trace waits its actual durable owners. |
| Root integration | L: remaining service/run composition; M: thin server/control registration; public exports, cross-repo consumers and final audits. | Actual collaborators migrated; never make a canonical service depend on the whole Studio service. |

At most three workers plus Root. Workers must not be kept idle behind a single composed diagnostic; bounded independent migrations may proceed once their interfaces are stable. Shared repository-wide readers require a coherent frozen tree or a task worktree.

## Explicit Defect Gates Requiring Scope Accounting

| Known issue | Present evidence | Required next decision/test |
| --- | --- | --- |
| Composed build stalls before start-state admission | Original positive reaches exploration and submission; diagnostic does not establish the root wait cause. Cleanup abort is not the cause. | Trace the actual entered persistence/current-child handoff with a bounded probe; approve one targeted fix, then rerun original positive on frozen owners. |
| Partial accessor/native-clock protection | Concrete source risks identified; only scaffolding/preflight edits saved. | Review complete guard scope and finite getter/replacement/legacy-compatibility tests before continuing. |
| Native model-log lifecycle completion | Existing native helpers accepted; new lifecycle not implemented, only isolated type scaffolds. | Separate identity-preserving lifecycle move from any additional completion protocol; explicitly decide the required integration gate. |
| Native dataset callback completion | Relevant production callback still requires genuine durable completion evidence. | Reproduce the actual required path; specify the smallest owner-level fix and failure/zero-repeat oracle before authoring code. |
| SQL cleanup fault retention | Four named cleanup branches corrected and covered with the foundation acceptance. | Preserve primary error identity when cleanup succeeds and both errors when cleanup also fails; rerun touched cases on later integration. |

These are finite named issues, not proof that additional mechanisms are already required everywhere. No discovered relevant weakness is silently called complete or omitted from release review.

## Restart Audit

### Decision and baseline

Preserve both task snapshots and the local source WIP. Retain proven mechanical migrations; finish them as bounded batches. Isolate additional admission/completion behavior and incomplete descriptor/clock integration for separate review. No source restoration was performed.

Today's `dev` is NOT the pre-refactor baseline. Core `dev` is `ff8eb0be8`, the t842 merge; downstream `dev` is `d6e5448c`, the paired t842 merge. Returning to those branches would discard t843 but retain t842. The immediate pre-t842 parents are Core `16b5043c5` and downstream `c9056f1a`. These identify the start of this ownership-refactor unit, not a claim that no earlier architectural refactoring existed.

Core t842 changed 1,401 files; t843 adds a 2,681-file delta against dev. Downstream t842 changed 112 files; t843 adds a 105-file delta. These are git changed-path counts including tests, docs and aliases, not independent features, completeness percentages or time estimates.

### Evidence checked by the lead

- `git status --short`, `git log --first-parent`, `git merge-base dev HEAD`, and diffs against dev and the t842 first parents establish the two rollback choices. Downstream source was clean; Core contained 49 modified tracked source files plus untracked source WIP.
- A read-only TypeScript declaration comparison found the WIP `AutomationStudioProjectDatabase`, `AutomationStudioProjectDatabasePool`, `AutomationStudioProjectUnitOfWork` and default migration-array declaration identical to their HEAD originals after line-ending normalization. The SQL lifecycle coupling is inherited; the move has not rewritten those bodies.
- Two committed migrations, `runtime/environment/virtual-clock.ts` and `runtime/run-control/run-controller.ts`, are byte-identical to the originals at dev. They are tangible reusable work, not merely forwarding wrappers.
- Nineteen functions in downstream `target-normalization/normalize.ts` have identical bodies to Core dev's original `model/action-element-target.ts` after whitespace/public-name normalization. The lead also inspected the real native-runtime bundle registration, target preparer and recording policy changes; these introduce paired public-hook integration that must be tested separately from body preservation.
- The lead inspected the new execution-admission lifecycle and engine driver. Their private capability state, persistence transitions and callback completion integration are behavior to review, not a mechanical file move. A stalled composed test does not by itself identify which of these changes caused the wait, or prove it worked on dev.

### Disposition and next acceptance

Supporting audits: [committed Core](runtime-ownership-reset-plan/reports/core-salvage.md), [local Core WIP](runtime-ownership-reset-plan/reports/wip-salvage.md), and [downstream](runtime-ownership-reset-plan/reports/downstream-salvage.md). The lead independently checked the representative findings listed above; broader worker findings remain source-audit evidence, not runtime acceptance.

| Group | Disposition | Next finite check before release |
| --- | --- | --- |
| Merged t842 foundations | Retain as reference/base; no evidence supporting wholesale removal. | Recheck touched consumers when completing dependent batches; do not claim the entire dev runtime is certified. |
| Committed t843 mechanical owners and aliases | Retain; split coherent moves from added behavior. | Canonical dependency/type closure, exact alias identity and owning-directory tests. |
| Local project SQL/schema/migrations/UOW move | Retain and finish, not restore merely because it is unvalidated. | Close exports/imports, preserve SQL/default/state identity, run database/schema/migration/UOW cases plus structure. |
| Downstream normalization, matching and recording/output preparation | Retain implementation bodies and original regression oracles. | Validate paired hook registration, custom matcher/override behavior and normal rebuilt public packages. |
| New admission/observation/completion mechanisms | Review as a separate integrated behavior unit, including all SQL and service consumers. | First isolate the actual stalled operation with a bounded witness, then require original composed positive and negative completion/replay cases. No piecemeal deletion of connected authority. |
| Partial descriptor/native-clock WIP | Preserve but keep out of a move-only release until completed and checked. | Inventory every read/copy/invocation and confirm getter/replacement/receiver compatibility with bounded regressions. |
| Five model-log contract scaffolds | Preserve as incomplete design artifacts; do not count as migrated lifecycle. | Decide the required lifecycle contract and demonstrate an actual connected consumer before release. |
| Budget move, frame helper and log exports | Retain subject to their own closure/identity checks; keep clock-dependent log edits with the clock review. | Original budget/alias tests, frame helper tests and public-export closure. |

### Observed failures and limits

The read-only full structure audit (`node scripts/structure-audit.mjs --json`) exited 1 on the frozen tree. Source blockers were: a barrel-bypassing import in `framework/persistence/project/migrations/contracts/runner-options.ts`; one statement-packing finding in `mutations/serialization.ts`; three packed lines in `mutations/unit-of-work.ts`; and two swallowed-failure findings in `sql/database.ts`. The last group is inherited unchanged cleanup behavior, not a new SQL rewrite. It requires a separately specified correction and error-identity acceptance; do not relax the audit. The audit also found this plan's missing blank after its H1, corrected as documentation during the audit.

No runtime tests, compiler checks, package builds, browsers, paid providers, database migrations or resets ran for this audit. Historical passing results remain historical. Source comparisons establish preservation of sampled bodies, not complete behavior or safe import initialization. This is a focused salvage audit, not an exhaustive proof for every changed module. The composed stall remains unlocalized; neither a clean-baseline pass nor a refactor regression is established.

The lead also confirmed concrete unfinished connections: `kernel/native-call.ts` still reads `options.nativeNodeExecutor` directly, while the new descriptor helpers aim to avoid accessors; `internal/coverage.ts` trusts the live-environment clock callbacks whose bodies still call mutable `Date.now()`/`Math.random()`; and the project persistence subtree lacks its parent barrel/public export integration. These are source-level gaps to close with targeted tests, not observed exploit/runtime verdicts or grounds to discard unchanged SQL bodies.

### Recommended execution order after review

1. Keep t843 preserved and inventory exact manifests for retained migrations and the separate behavior unit. Do not reset either repository to dev or pre-t842 wholesale.
2. Finish SQL's public seam, canonical closure and named structure blockers; validate with existing focused SQL/schema/UOW cases. Keep error-handling corrections explicit rather than silently bundling them into a move.
3. In parallel on disjoint paths, validate retained owner migrations and downstream paired hook contracts. Isolate the composed waiting operation in the behavior lane before any broad rerun.
4. Close the remaining A-N ownership batches and enforce actual Studio/browser boundaries; extract shared chat only afterward.

No measured finish date follows from this audit. Earlier 1-3 day and conversational 2-4 day ranges were unsupported by a frozen batch schedule. A one-day commitment for the whole scope is not established either. Build a replacement schedule from exact batches and the localized stall; do not turn changed-file counts into an ETA.

## Work Ledger

### 2026-11-02 - Explicit implementation stop and planning reset
- Agent: senior supervisor.
- Changed: requested immediate worker freeze and recorded this proposed finite plan. No source changes after the user's stop.
- Validation: read worker stop reports and current git status; no tests/builds or runtime checks authorized or run during this planning step.
- Outcome: planning only; source WIP preserved locally and remains unvalidated in aggregate. No further implementation release.

### 2026-11-02 - User-authorized restart-versus-salvage audit
- Agent: Codex senior supervisor, with three read-only audit workers.
- Changed: audit briefs/reports and paired planning documentation only. All existing source WIP preserved.
- Validation: `git merge-base dev HEAD` -> Core `ff8eb0be8`, downstream `d6e5448c`; both are t842 merges. TypeScript source comparisons -> four SQL declarations, two committed runtime files and nineteen downstream function bodies preserved as described above.
- Validation: `node scripts/structure-audit.mjs --json` -> exit 1; four source-path blockers and the existing plan header violation recorded above. No source fix attempted.
- Outcome: selective-retention recommendation; implementation remains paused and runtime correctness remains unverified.
- Validation: `node scripts/structure-audit.mjs --rule working-docs --update` and `node scripts/structure-audit.mjs --rule working-docs` -> exit 0 in both repositories; generated indexes refreshed without changing either structural baseline. `git diff --check` on owned documentation -> exit 0. No full test/build sweep consumed.
- Git disposition: audit documentation is committed locally on the existing t843 task branches. Push/integration held because Core's preserved source WIP has the observed structure failures; no source changes are staged and neither dev nor main advances.

### 2026-11-02 - Approved execution and retained small-unit acceptance
- Agent: Codex senior supervisor.
- Changed: user resumed implementation; assigned exact SQL/guard/stall briefs, preserved all WIP, opened time-reduction investigation.
- Validation: `pnpm.cmd exec vitest run src/runtime/agents/budget/run-cost-ceiling/tests/run-cost-ceiling-env.test.ts src/programs/automation-studio/model/run-cost-ceiling/tests/run-cost-ceiling-env.test.ts src/runtime/execution-observation/tests/frame-unknown.test.ts --minWorkers 1 --maxWorkers 1` (packages/fluxiq) -> 3 files, 17 tests passed, 1.95s.
- Validation: `node -` TypeScript strict two-root closure -> 72 local modules, zero errors and zero program dependencies; `node --input-type=module -` scoped structure -> 19 files, zero failures. These are stable owner checks, not aggregate-tree acceptance.
- Outcome: budget move/frame helper accepted as a small unit; other batches remain active. User explicitly requested maximizing safe speed; measured costs and controls recorded in reports/time-reduction.md.

### 2026-11-02 - Foundation validation and bounded runtime witness
- Agent: Codex senior supervisor with file-owned workers.
- Changed: canonical project SQL/migrations/schema/UOW and exact legacy aliases/consumer imports; four named cleanup-error branches; first descriptor/native-clock adapter batch. Lead resolved the API change-feed duplicate type by re-exporting its canonical declaration, moved the alias-identity test to legacy ownership, and moved all 18 original pool cases to canonical SQL tests without changing assertions.
- Validation: lead SQL selection -> 16 files, 78 tests passed, 38.45s; strict project-index closure -> 174 local modules, zero diagnostics/program dependencies. Source comparison accounts for all 137 old declarations: 35 retained, 96 moved token-identical, 3 moved whitespace-only helpers, one equivalent result alias and two state-owning classes with the four explicit cleanup corrections; none missing.
- Validation: `pnpm.cmd --filter fluxiq check` -> first failed on callback whitelist typing and duplicate API type; after narrow overload/type-alias corrections -> exit 0 (63.331s).
- Validation: lead grouped callback/native-log/clock/node/host/environment plus alias cases -> 21 files, 168 tests passed, 19.28s. Relocated pool/alias cases -> 2 files, 22 passed, 2.45s.
- Validation: `node .fluxiq/refactor/lead-common-structure.cjs` -> initial reverse test imports, then directory-count failure; after test ownership moves -> exit 0, 43.744s. No baseline growth/exception.
- Validation: `node scripts/build-cache/cli.mjs contracts:build fluxiq:build client-gateway-websocket:build` -> exit 0; contracts/gateway reused, FluxIQ 118.852s/22,571 outputs. Emitted `fluxiq/framework/persistence` smoke -> public import and original constructor/migration identities true, 30 default migrations.
- Validation: `node .fluxiq/refactor/stall-reset-run.mjs` with frozen slot -> intentional diagnostic cancellation/exit 1, not acceptance; 182.58s Vitest (68.62s collection/113.14s tests), 183.747s runner. At cancellation 158,631 mutation-proof gets/392 events; all 177 entered store calls eventually drained, no fixed FIFO/native wait established. Original positive remains unverified.
- Outcome: first ownership batches have bounded evidence; next queued source units are rich Flow contracts, remaining callback/clock adapters and transaction-local proof loading. Downstream normal rebuilt-package gates passed before source release: domain check/build, 82 selected cases (zero failed/cancelled/skipped), extension check/build for Chrome/Firefox/e2e-Chromium. No live browser was run. No paid/browser/panel run or full sweep launched.

### 2026-11-02 - Separate push-gate time optimization
- Agent: Codex senior supervisor.
- Changed: Core pre-push uses the existing all-visible-input structure-audit cache and captures one failure output rather than running a failed audit twice. This is a separate tooling optimization, not an ownership migration.
- Validation: `bash -n .githooks/pre-push` -> exit 0; `node --test scripts/build-cache/tests/audit-replay.test.mjs scripts/build-cache/tests/invalidation.test.mjs scripts/build-cache/tests/stamp-rules.test.mjs scripts/build-cache/tests/registry.test.mjs` -> 21 passed, including changed-input invalidation and uncached failures. Actual hook cold/reuse calls both exited 0: 52.091s cold, 1.609s unchanged; same fingerprinted audit gate. Documentation changes still invalidate the cache.

### 2026-11-02 - Parallel rich contracts, proof reuse and admission ownership
- Agent: Codex senior supervisor with file-owned workers.
- Changed: complete Flow/publication/settings contracts and complete session/action/fact/evidence contracts moved with exact legacy exports. Transaction-local admission inventory reuses its existing bounded mutation-record read; command-link direct SQL behavior is preserved. P1 moves actual admission/command-ledger SQL owners and state, with27 direct legacy aliases; outside consumer import-only retargeting assigned separately.
- Validation: lead rich Flow parity/closure/scoped checks ->36 declarations preserved,405 modules/zero diagnostics/program dependencies,58 files/zero local structure failures. Lead grouped rich/performance tests ->9 files,50 passed,10.05s. Proof fixtures with8/24 child histories reduce native proof gets18/50 to0/0; corruption, project isolation and staged-write rollback cases pass. Whole-build elapsed improvement remains unmeasured.
- Validation: lead session/evidence parity ->9 complete declarations and old export surfaces preserved; evidence-only strict closure ->11 modules/zero diagnostics/program dependencies;18-file scoped structure ->zero failures. Full session trace/compiler closure waits for frozen engine collaborators; erased runtime type assertions are not compiler evidence.
- Worker claim awaiting lead acceptance: P1 ->49 original declarations preserved,271-module strict closure without Studio,60 cases passed. Parallel clocks ->125 passing cases in first owner run, one mixed legacy/observed fixture reconciled without weakening guards, then5/5 boundary cases passed. Final combined checks still required after the final observation forwarding line.
- Assigned: callback_guards finishes descriptor/clock/environment adapters; stalled_build owns router-owner-entry brief (complete routing contracts, actual state-routing move, then proposed real existing-kernel entry); sql_foundation performs only19 import/export specifier replacements across17 exact outside-consumer files. File ownership transfer of Studio router-state.ts confirmed; engine router/run and shared helpers remain callback-owned.
- Outcome: source batches local pending coherent combined acceptance. No provider/browser/panel/full sweep launched. Five isolated model-log scaffolds remain preserved and unfinished. Remaining A–N/backend/web/chat work remains required.

### 2026-11-02 - Routing, configured tools and original reset-read parent
- Agent: lead and three file-owned workers; exact briefs/reports remain under this plan directory.
- Changed: rich routing/policy contracts and actual state-routing bodies moved, original-kernel routing entry added, two thin callers forward original graph options. Ordinary service freshly constructed options still have no observation binding; P3 integration remains explicitly required. RequiredCommandRun lifecycle was not changed or called twice.
- Validation: lead `node .fluxiq/refactor/router-owner-verify.mjs` ->18 declarations/bodies and actual exports preserved,37 unrelated model declarations unchanged,13 thin caller changed lines/zero unauthorized changes at that checkpoint. Later independent P2 consumer import changes have their own manifest.
- Changed: complete tool result and harness binding moved; P2 moves the original tool observer/private state once. Lead saved-source checks ->two complete prerequisite declarations/docs/literals exact;19 P2 declarations exact and22 direct aliases. Lead applied outside18-file/19-specifier imports only, including8 narrow forwarding targets; inverse changes recover every original byte. Full registry/type/runtime/browser-forwarding acceptance still pending.
- Changed: separate reset-read-parent defect forwards the actual existing call through baseline/settled reads and capture, only when its original private scope exists; unobserved reader argument tuples remain unchanged. No new source, scope or completion proof.
- Validation: new actual observer/StartCheck regression red ->zero passive callbacks instead of two,1 failed/36.28s including35.59s collection. After two source edits, the new case and four original site-reset files ->36/36 passed,50.18s including47.15s collection/70ms tests. The new regression was then expanded to cover both baseline and settled-read branches; repeat is held for the common grouped check. This confirms a dropped-parent defect, not the composed stall's exact cause.
- Changed: callback review additionally accounts successful unsupported custom callbacks, preserves exact canonical live/native built-ins, retains original unobserved clock-error behavior, and rejects observed Proxy reflection before traps. Actual frame/property lead check before the final Proxy cases ->8/8 passed,2.04s.
- Outcome: all current source frozen for combined readers. Core local P1 checkpoint6ff258505 awaits coherent push; downstream task documentation pushed through2b701020 after its generated index correction. Dev/main unchanged; no full sweep/provider/browser/panel launched.

## Open Questions

### Lead P1 acceptance checkpoint

`pnpm.cmd exec vitest run` with the8 exact SQL/ledger files listed in reports/admission-sql-owner.md ->60/60 passed,61.57s (38.65s collection,18.81s tests). Lead strict two-barrel TypeScript check ->271 source modules,zero diagnostics/program dependencies. `node .fluxiq/refactor/lead-p1-parity.cjs` ->27 direct-export aliases,49 declarations preserved after resolved import-type path normalization,17 outside files/19 replacements inverse to entire original bytes. `node .fluxiq/refactor/lead-p1-structure.mjs` ->81 files,zero failures,three unchanged pre-existing baseline entries; baseline not changed. Raw rule probe first reported those existing entries before applying the normal audit ratchet. Emitted process-restart, whole-graph/package and composed gates remain held for common freeze. This supports a local coherent P1 checkpoint, not dev/main integration.

The user approved execution of this migration/defect split. Exact batch manifests and the localized stall determine scheduling; earlier estimates remain withdrawn as unsupported.
