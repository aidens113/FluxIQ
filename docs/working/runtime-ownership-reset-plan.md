# Runtime Ownership Refactor: Reset Plan
Status: Active
Status detail: Planning only after the user's explicit stop; implementation is frozen pending review.
Created: 2026-11-02
Last updated: 2026-11-02
Owner: Senior supervisor
Scope: Establish finite ownership migrations and acceptance for Core, downstream web boundaries and the subsequent reusable chat package.
Paired document: ../!FluxIQWebExtension/docs/working/runtime-ownership-reset-plan.md
Related: [existing record](runtime-ownership-refactor.md), [remaining owner inventory](runtime-ownership-refactor/reports/remaining-backend-owner-map.md)

## Current State

All three workers stopped. No implementation, tests, builds, providers or browser runs are active. Further source work is not authorized while this plan is reviewed.
Authoring pair: C:/Users/osrs_/FluxStuff/fxwork/t843/!FluxIQ and sibling !FluxIQWebExtension, task/t843-runtime-foundations. The IDE's t842 document is an older checkout.
Latest pushed checkpoints: Core c0dee9bbe, downstream 460a5af6. They are partial task backups; dev/main have not advanced for this unit.
At that checkpoint Core typecheck/structure passed, normal public-package downstream domain check/build passed, all82 selected domain cases passed, extension check/build passed. One real composed build test remains stalled before start-state admission; no complete-runtime acceptance is claimed.
Newer local work is unvalidated in aggregate: a mechanical project SQL/schema move, partial descriptor/clock integration, five isolated log contract files, and Root's small budget/helper/export changes. Preserve it; do not silently discard or label it passing.
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
| SQL cleanup fault retention | Historical behavior was identified; current SQL move contains no cleanup fixes. | Review named primary/cleanup/close cases separately from the mechanical ownership move; preserve original errors and state. |

These are finite named issues, not proof that additional mechanisms are already required everywhere. No discovered relevant weakness is silently called complete or omitted from release review.

## Work Ledger

### 2026-11-02 - Explicit implementation stop and planning reset
- Agent: senior supervisor.
- Changed: requested immediate worker freeze and recorded this proposed finite plan. No source changes after the user's stop.
- Validation: read worker stop reports and current git status; no tests/builds or runtime checks authorized or run during this planning step.
- Outcome: planning only; source WIP preserved locally and remains unvalidated in aggregate. No further implementation release.

## Open Questions

Root must review this migration/defect split with the user before implementation resumes. Specific batch sizes and duration must be based on the frozen file/dependency manifests; earlier estimates are withdrawn as unsupported.
