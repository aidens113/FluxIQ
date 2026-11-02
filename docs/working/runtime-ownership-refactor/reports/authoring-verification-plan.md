# R7 reusable authoring and verification plan

Outcome: Read-only plan complete. Implementation has not begun; SOURCE FROZEN.
Worker: node_ownership, heavy gpt-6.1-sol max. Date: 2026-11-02.
Owned changes: this report only. No source, shared working document, index, other report or git mutation.

## Recommendation and observed scope

The first executable unit is the real draft mechanism subsystem, `runtime/flow-draft/**`: 54 production modules and 5,184 lines, including comments/barrels. Its production import closure reaches only Core JSON, two already-canonical parameter binding functions, and one destructive-consequence predicate still under Studio. It contains no persistence/provider/browser APIs. It already implements amendments, bindings, stable step identity, routing, replay eligibility, kept/carried configurations and duplicate/reversal handling. Move these mechanisms with a narrow presentation seam, not just their types.

Subsequent units must extract the actual authoring/trial/verification/repair authorities from their service adapters. Do not move `flow-bootstrap/**` wholesale to a generic directory: it currently has 395 production modules. Current other inspected group inventories: draft 54; recovery 61; result verification 274; service project-build 25; candidate-trial 25; subflow-trial 9; trial-ports 7; instruction-led 9. Counts exclude tests and include barrels. Import graphs and decisive implementations were inspected; this is not a claim that every function in all 1,000+ related modules was manually reviewed.

Abbreviations below: `S` = `packages/fluxiq/src/programs/automation-studio`; `F` = `packages/fluxiq/src`; `C` = `packages/contracts/src`. Downstream paths are in paired `!FluxIQWebExtension`.

Canonical public roots should be `fluxiq/runtime/flow-authoring` and `fluxiq/runtime/verification`, with pure plan/draft contract exports available through focused authoring feature barrels. Public package/config/root-barrel integration remains lead-owned until explicitly assigned. Existing executable graph, runtime models/agents, host, permission, environment and state/recording seams are dependencies; do not recreate them.

## 1. Exact first implementation unit

### File ownership and closure

Own `S/runtime/flow-draft/**`, including existing subject tests, and new `F/runtime/flow-authoring/draft/**`. Narrow subowners are `draft`, `step`, `amendment`, `bindings`, `replay`, `routing`, `carried-step`, `scheduled-candidate`, and `presentation`; preserve cohesive existing groups and depth limits instead of putting 54 leaves in one folder.

Retarget `binding-forms.ts` from the old node barrel to `F/components/automation` for `automationNodeStateBinding` and `isAutomationNodeParameterStateBinding`. These are already canonical implementations, so no second binding parser is needed.

`verify-only.ts` imports only `isAutomationStudioDestructiveActionConsequence` from the old permission owner. Its table in `S/runtime/action-permissions/destructive.ts` marks move_money/delete/send_or_publish as requiring human authority and create_new/modify_existing as false. Coordinate one of these exact cuts with R6 before editing: move that table/predicate and related exports/tests to `F/runtime/action-permissions/destructive.ts`, leaving the old leaf a facade; or consume R6's canonical implementation if it has moved already. Do not copy the table, inject a permissive fallback, or import the Studio permission barrel canonically.

Keep draft wire/schema/tool/issue strings unchanged, including `automation-studio.flow-draft.v1`, `core.flow_draft`, replay codes and full-run-required codes. Keep all old exported types/functions/constants available through the old feature barrel. Pure facade exports must have identical implementation identity; wrappers that supply presentation policy must have behavior/byte parity instead.

### Presentation boundary required in this first unit

`entry.ts` combines structured draft projection with large instruction strings; those include browser examples such as cookie banners, menus and page navigation. `full-run-required.ts`, `dry-run.ts` and `excused.ts` also combine mechanics and words. Separate projection/diagnostic facts from text. A typed `DraftPresentation` takes mode/feature flags or a named refusal's narrow facts and returns text. It must not receive a service, raw graph store, arbitrary callbacks, or all unscreened evidence.

Suggested operations are `entryInstruction({ mode, hasBindings, routeKind, hasReplaced, hasChecked })`, `fullRunRequired({ steps, nothingRan })`, and `excused(reason)`. Retain exact old text construction in a compatibility adapter while moving browser-specific example clauses to a registered downstream authoring presentation adapter. There must be no default Core browser instruction. Generic outcome labels and bounded evidence/word screening are mechanics and can remain canonical.

`control-words.ts` is not the active DOM label reader: it validates a supplied string against already-shown JSON and bounds it. `step-words.ts` already invokes a supplied descriptor, sanitizes its `{target,text}` result, and carries it. These should move as mechanisms with a typed descriptor result. Concrete ARIA/element/selector interpretation is elsewhere and remains subject to the HostSemantics cut below.

### First unit acceptance

Move the existing draft tests with their subjects. There are 34 existing test files: 22 root subject files plus amendment/bindable/carried-step/route-places/scheduled-candidate tests. Preserve the existing assertions rather than replacing them with smoke tests. Key subjects: `step`, `accrual`, `binding-forms`, `binding-render`, `flow-inputs`, `routing`, `dry-run`, `verify-only`, `full-run-required`, `starts-where-it-stands`, `sometimes-present`, `site-memory`, `reversal`, `second-copy`, `entry`, amendment `apply/reach/drop-reversal/second-copy/settings-rewrite-run/claim-refused`, and scheduled candidate copy/identity.

Add a neutral program-independent closure test following import/export and import-type nodes, including tests. Add old-facade identity assertions in a Studio-owned compatibility test; canonical tests may not import Studio. Add presentation adapter byte tests for existing instruction output. Specifically retain stable step IDs when positions change; decision-wide shown numbering; replay invalidation after reordering/configuration changes; priorExecution.lasting surviving checked candidate retargets; scheduled candidate private correspondence; binding source ordering/output checks; duplicate read/press rejection; opposite toggle removal only after strand checks; and all unrunnable reasons.

Run only canonical draft/destructive subject files and the compatibility adapter tests, plus scoped structure rules. No full authoring/service suite is needed for this first pure mechanism unit. A new source brief must explicitly grant the shared permission predicate and export call sites; this report is not source authorization.

### Ready-to-dispatch bounded brief

```text
Role: Heavy worker, gpt-6.1-sol, max.
Goal: Move the actual closed Flow draft mechanisms into neutral authoring ownership.
Own: S/runtime/flow-draft/**; F/runtime/flow-authoring/draft/**; own report.
Extra only after coordination: old/canonical action-permissions/destructive.ts and subject tests.
Read: this report section 1; existing draft subjects and two external imports.
Stable dependencies: components/automation parameter bindings; canonical JSON/permission contracts.
Keep: every old symbol/schema/code, draft semantics and exact compatibility presentation bytes.
Split: draft facts/projection from typed DraftPresentation; no Core browser wording fallback.
Do not touch: service/project-build, trial runners, result verification, shared docs/config/git.
Use canonical feature barrels; no erased Studio imports or baseline remapping.
Tests: existing draft subject tests relocated, permission predicate, canonical closure,
old facade identity and presentation adapter byte parity. No paid/full suites/browser.
Report exact moved/retained owners and observed checks; return SOURCE FROZEN.
```

## 2. Stable ports for the remaining groups

These ports must be declared under focused canonical feature owners before their consuming orchestration moves. They are proposed operation contracts, not a generic service facade. Reuse `ExecutableFlow`/`ExecutableGraph`, engine trace/incident/change contracts and canonical model/agent budget types. Optional legacy project/flow/run IDs may be opaque addresses; no neutral type imports a Studio service, artifact envelope, conversation, record store or UI event.

| Port | Narrow data and operations | Actual old edge it replaces |
| --- | --- | --- |
| `ArtifactSource` | Read immutable `ExecutableFlow` plus dependency snapshots, source/instruction binding and compiler/registry digest; read current binding independently; resolve owned subgraph; return explicit missing/stale/unavailable outcomes. | Candidate trial `parentFlow/snapshots/currentBaseDigest`, recovery flow/router/subflow reads, candidate generation `currentBinding`. No fabricated artifacts with empty editor fields. |
| `DraftStore` | Load/save an unverified candidate revision and optional incomplete continuation using candidate ID, digest, source binding, base dependency/settings revision and accounting receipts. Save returns the exact saved reference or classified refusal; discard is explicit. | `service/candidate-drafts/{record,store,source}.ts`, incomplete-draft keeper callbacks and candidate-generation persistence. Studio retains JSON path/schema/version adapter and project creation. Do not claim new atomic compare-and-save until storage actually supplies it. |
| `History` | Read revision-bound trial records, prior refutations, accepted/applied change receipts and limited instruction/conversation facts; append typed authoring/trial/change events; flush acknowledged writes. | `candidate/submission.ts`, project-build records/proposals/acts/toggles, flow-version history, refuted-result history. Never read latest verdict without revision/digest. |
| `EvidenceSource` | Read screened result record sets/read accounts, immutable attempt facts/end view, supporting recording descriptions and source provenance; include completeness/withheld/unavailable markers and fixed reference time. | `service/evidence/**`, instruction-led recording projection, candidate-trial summary/reads, recovery context and result-summary assembly. It supplies observations, not preapproved yes/no. |
| `ResultSink` | Open/update a trial session by run ID; append completed model-call/accounting receipts; save verification/refutation/repair phase; append application result; flush. Explicit claim/stage/finish/reconcile operations for durable verification are a separate `VerificationLedger`. | Candidate trial open/write session/processDatasets, verification run-detail writer, recovery annotation/applications and project ledger writes. Persistence failures cannot look like successful side effects. |
| `Presentation` | Receive typed progress, ending, check, permission and draft facts; emit bounded activity/display text. Model-facing instructions remain exact through the compatibility adapter. | `emitAutomationStudioActivity`, project-build ending words and `check-activity.ts`; no canonical UI/activity or conversation DTO dependency. |
| `Model` | Canonical `ModelProvider<Request>` and purse/ledger for generic calls. Flow task adapter exposes typed `decideAuthoring`, `judgeResult`, `diagnoseIncident`, `planRepair` request/result envelopes, with diagnostics, call receipt, truncation mark and temporary/spent-call classification. | Calls to Studio harness/task kinds from candidate loops, `verify.ts` and recovery. Task schema/prompt bytes are supplied by the Flow task adapter, not provider transport. No `runHarness(unknown): unknown` port. |
| `HostSemantics` | Typed safe call description/opaque target identity; authoring fact parse/validate/negate/requirement ID; observed target/result/witness facts; location token and owned-act reversal/settlement. Results are discriminated known/unknown/refused with provenance. | DOM readers, browser fact grammar, selector ranking, reset witnesses/target matching. Uses existing canonical host/matcher interfaces where available. Missing host interpretation is conservative/unavailable, never an inferred browser algorithm. |

Keep source and permission binding separate from instructions shown to the model. The authoritative source includes instruction revisions/text digests and effective/excluded inventory; a model's shorter paraphrase is not a replacement source. Result/history ports carry acknowledged facts, not `Promise<unknown>` that lets an adapter discard a refusal.

## 3. Coherent remaining extraction units and dependencies

### A. Plan/script acceptance and requested coverage

Old sources: `S/runtime/flow-bootstrap/{plan,authoring,script-statements,script-wiring,parameter-schema,parameter-words,record-defaults,numeric-text,answerability,reachability,instructed-acts}/**`, plus focused root contracts/context/defaults used by these groups. The first parser/assembler cut is `authoring/{parse,accept,assemble,assemble-draft,json-plan,normalise,contracts,...}` with the actual `plan` DTO/validation closure, then coverage/checklist/reachability as a second bounded unit. The acceptor must remain the single normalization authority for script, JSON plan and accrued draft; do not create another assembler in an adapter.

Canonical owners: `F/flows/authoring/{plans,scripts,coverage}/` for pure contracts/transforms, `F/runtime/flow-authoring/acceptance/` for registry/host-bound acceptance. Keep layout and persisted Studio router/subflow/artifact envelopes in service adapters. Use canonical components registry and executable graph contracts; caller grants/capabilities remain explicit. R1/R4/R5/R6 interface handoffs must be fixed before dispatching their shared edges.

Domain cut needed here: `plan/contracts.ts` defines facts requirement `web.facts@1`; `script-statements/fact-condition.ts` parses browser-shaped visible/enabled/dialog predicates; `flow-requires.ts` installs that requirement. Introduce a trusted fact grammar/capability adapter and move the current web interpretation downstream. The generic parser can preserve opaque tokens and relation syntax, but it must not select a web capability or interpret DOM fields. Keep the current web syntax and `metadata.requires` bytes in the downstream adapter. Unknown fact syntax is a typed refusal; do not silently remove a condition.

Acceptance files: existing authoring acceptance/assembly/script grammar, plan parsing/validation/catalog, answerability/reachability and script-statement tests; draft-to-graph equality and original source/digest fixture tests. Use bounded groups, not all 395 modules in one run.

### B. Draft submission, trial gate and build completion

Old sources: `flow-bootstrap/{candidate,subflow-candidate,subflow-submit-then,incomplete-draft,unfinished-build,unchanged-fix-point,test-request,trial-defaults,retest-advised,generation-failure,authoring-result}/**`, plus instructed-acts/coverage consumers and remaining Flow evidence-loop adapters. Canonical owner: focused `runtime/flow-authoring/{candidates,subflows,completion,continuations}/`.

The actual single authoring loop and gate move, using the canonical agent iteration driver rather than adding a second loop. Separate service candidate save/promotion from session-local candidate revision/digest tracking, actual trial requests, no/unsure history and completion policy. `candidate/submission.ts` already owns session-local submissions; `candidate/trial-gate.ts` already owns retesting and completion. Preserve that authority.

A judged no closes that Flow digest; a yes belongs to the tested revision/digest; no-runner completion can yield only an unverified draft. Failed/unjudged/unsure trials never become yes. Preserve same-failure closure, unchanged submission behavior, input/output requirement validation, kept-condition/step/toggle/pacing evidence and explicit refusal codes. Do not let generic repeat guards override the trial gate's `retry_allowed` decision. Incomplete draft writes may fail while the original build failure remains primary, but a failed write must not return a pointer to nonexistent data.

Tests: candidate `authoring-loop`, `submission-*`, `trial-gate*`, `unchanged-submission`, `stall-retest`, reset-witness/pace/toggle/kept-condition groups; subflow `builder-loop`, `subflow-trial-whole`, `submit-tests-on-accept`, `submit-then-sequence`, `trial-latest`; incomplete/unfinished build subjects. Preserve existing service-through-loop adapter checks after source stable.

### C. Trial execution and strict verification receipts: two explicit protocols

Old sources: `flow-bootstrap/verification/**`, `service/{candidate-trial,subflow-trial,trial-ports,offline-first,offline-trial}/**`; stored ledger DTO slice from `S/storage/project/candidate-verification/contracts.ts`.

Canonical owners: detached execution composition beside canonical engine execution; `runtime/flow-authoring/trials/` for revision-bound prepare/run/rejudge orchestration; `runtime/verification/{requirements,receipts,sessions}/` for strict evidence/controller/durable-stage algorithms. Studio trial-port composition retains binding/project selection and its open/write/process datasets/result adapters. The physical SQL/JSON store/migration stays `S/storage/project/candidate-verification` implementing `VerificationLedger`.

Important existing mismatch: ordinary `service/candidate-trial/run.ts` creates a strict verification identity using `originalInstructionsDigest ?? candidate.requirements.unbound` and synthesizes a minimal start receipt solely to satisfy detached runner equality. Do not reproduce this as a generic artifact/receipt adapter. Split `ExecutionTrialBinding` (candidate/revision/digest/base dependency/run identity and actual start outcome) from `CandidateVerificationIdentity` and evidence-backed `StartReceipt`. The ordinary runner must accept its honest execution binding; the strict controller continues to require actual requirement/source/start/provenance evidence. This is an explicit contract cut with equivalence tests for normal trial behavior, not permission to manufacture missing evidence.

Strict controller inputs already define typed predicates and prepare/execute/observe/promote operations. Preserve start timestamp/generation/unique observation checks, exact identity/run/start receipt linkage, command provenance, complete field/enumeration checks, create-vs-ensure semantics and stale/cancel checks before each stage. Passive legacy `pageGeneration` field can remain wire-compatible; neutral code only compares it.

Durable session owns one claim, stage begin/commit, finish and reconciliation. Its current promotion collaborator deliberately returns `unsupported_storage_authority`, so all accepted verification remains a draft with a receipt/refusal. Preserve that behavior. Do not enable promotion, bypass ledger authority or reinterpret a committed verification receipt as accepted graph state. Pending/unknown claims block repeated start/reset/execute across concurrent sessions/restart. A lost finish acknowledgement can return the matching committed result only after authoritative reconciliation.

Tests: verification `controller`, `identity/predicates` subjects where existing; `detached-execution`, `detached-subflow`, `detached-subflow-from`, `candidate-owned-subflows`, `durable-session`, `process-restart`, `reference-now`; candidate-trial `run`, `rejudge`, `prepared-start`, `judging-fits`, `promotion`, `start-lease`, environment/trace, site-change and existing real store adapter tests. Preserve the durable tests that prove no mutation/side-effect replay rather than replacing them with a fake in-memory accepted artifact.

### D. Owned changes, trial delta and reset evidence

Old sources: `flow-bootstrap/{site-reset,reset-admission,reset-ledger,reset-settlement,reset-undo,reset-answers,trial-change}/**`, coupled project-build phase-start/reset-calls/acts/toggles collaborators. Canonical owner: `runtime/flow-authoring/{effects,witnesses,trial-change}/`, consuming canonical action permissions and host observation/identity ports.

Move generic ownership/ledger/claim/witness comparison and deterministic findings; inject concrete location/read/target/undo semantics. The one shared build ledger remains the authority across brief/trial steps. `site-reset/explored-on-absorbed.ts` reads ARIA/visible/placeholder/element fields today: that interpretation goes downstream through safe description/identity ports, not into this canonical group. Core cannot infer an undo's subject from label similarity.

Preserve before-state and change-based judgment, targeting only this build's owned lasting acts, observed absence-before-created ownership, original inventory, exact item identity, no undo of preexisting data, uncertainty blocking duplicate lasting action, and honest unresolved outcomes. A reset occurs only where the before-state prevents a meaningful trial; optional deployment start hooks retain their existing declared ordering/recording, not a newly introduced unconditional reset. Offline trials have no live reset/hook.

Tests: existing site-reset ledger-subject/create-baselines/per-group-seal/start-check/refusal/reload/unmeetable/unreachable; reset-admission page-destination/stamp/step-tab; trial-change delta/proof/session/witnesses/unwitnessed; project-build reset/phase-start/acts-record/shared-toggles tests. These are safety tests, not merely formatting checks.

### E. Result evidence, verdicts, agreement and model orchestration

Old sources: `S/runtime/result-verification/**`, `result-check-{authorization,schedule}/**`, relevant service result-check adapters and build-test summary/judge.

First freeze canonical verification DTOs from `result-verification/contracts/**`, record-set/read/flow-step/result summaries and fixed reference time. Separate Studio `FlowRunDetail`, intervention and UI dependencies into fact/receipt/presentation adapters. Move deterministic `computed-facts`, `requested-output`, `value-readings`, `read-account`, `request-rows`, `located-defects`, `verdict`, `standing-no`, `refuted-no`, `agreement`, `first-ask` and related evidence transforms in bounded dependency groups. The record comparison/checklist semantics are reusable; actual DOM capture and row/control interpretation come from HostSemantics/EvidenceSource.

Then move the actual `verify.ts` orchestrator, deadline/accounting, typed ask/receipt trail and recheck order to `runtime/verification/results/`. It consumes a typed judge port implemented by the existing Studio Flow task harness adapter. Generic provider transport is already canonical; do not move task prompt/diagnosis schema into models or import the Studio harness canonically. `check-activity.ts`/UI label selection uses Presentation; return verification facts unchanged.

Preserve: computed failure before provider resolution, but computed pass never substitutes for a judge yes; required-output hold even after yes; empty result judged rather than exempted; runtime first yes vs build-test confirmation; converse confirming question; each check's shared temporary/correction ask bound; no retry for cancellation/key/purse refusal; truncated-after-verdict typed handling and no use of cut prose; precise order/bounds of contradicted/narrowing/split/unsupported-no reasks; located defects tied to Core records; exact call/intervention/accounting order. The header's historical statement that verification has only two calls is insufficient: current code has multiple bounded reask paths. Preserve observed branch behavior, not an invented total call cap.

Tests: `tests/verify`, `deadline`, `computed-facts-route`, `requested-output-route`, `first-ask-route`, `reask-route`; `agreement`, `verdict`, computed-facts, located-defects, refuted-no, requested-output subject groups; build-test `judge`, `judge-timeout`, `judge-requested-output`, `first-ask`, `change-lines`, `landing`, `paged-read-proof`, `stores`, `summary`, `task-checklist`. Compare exact model request/prefix and receipt traces with a provider-free fake judge; never weaken oracle outcomes or rewrite prompt guidance to fit test rows.

### F. Repair and project build orchestration

Old sources: `recovery/**`, `live-patch.ts`, `live-patch/**`, `exploration-reduction/**`, `service/{runtime-adaptation,adaptations,candidate-failure}/**`, project-agent builder/supervisor/assembly machinery and reusable parts of `service/project-build/**`/`flow-bootstrap-commands/**`.

Canonical owners: engine adaptation for pure patch/preflight/resume; `runtime/flow-authoring/{repair,exploration,build}/` for Flow task policy and actual repair/build loops; canonical agents for scheduling/budget/iteration. Studio keeps project commands, selected Flow/settings/provider resolution, conversation/source/history retrieval and durable adaptation/application envelopes. Do not move broad `AnnotationPorts` or `AutomationStudioProjectBuildPorts` unchanged: their paths/stores/run detail/intervention types are exactly what the new ports separate.

`service/project-build/run.ts` proves the cut: it composes real dispatcher/supervisor, reserve/purse, shared ledgers/trials, routing, activity and final save. Its mechanism moves only after those ports exist. Preserve flush of acts and toggles before draft persistence, current dependency/settings binding check, source instructions and candidate identity, nonpromotion after cancel/partial/time-limit, separate same-Flow historical trial vs latest-revision yes, reserved judged whole run and repair calls, and brief/host resource lifetime. Studio `records.ts`/path construction and record envelope stay adapters.

`recovery/refuted-result/repair.ts` already routes a wrong result into the same failed-step recovery authority, with bounded prior refutations and persisted phase. Retain that single repair pipeline. In-run repair preserves smallest repair unit/contract/attempt history and resumes from the failed point. After targeted repair the remaining path is checked from that point; the whole Flow is run from its start only when ready for the final judged whole run. No additional competing reauthor loop or unconditional restart/reset.

Tests: recovery annotation permissions/person-needed/iteration/patch reserve/patches; in-run-repair history/request-slot/unit-contract; refuted-result history/attempt/brief/reauthor/purse; project-build entry preparation/subflow entry/phase start/ledger/reserve/permissions/whole judged trial/time limit/facade. Keep service-through-canonical-loop tests; a standalone new loop test does not prove existing composition uses it.

## 4. Concrete domain and persistence edges

Active interpretation to remove from Core, with actual downstream owners:

- `service/instruction-led/recording-steps.ts` reads `parameters.element`, target fingerprint, role/implicitRole, input/change/type event suffixes, pointer/passive event patterns, checkbox/switch toggles and sensitive web field attributes. Move its interpretation to a downstream recording summary adapter, using `domain/src/recording/{events,reducers,observations}` and `domain/src/sensitivity`. Core may bound/count/order typed safe descriptions and apply declared replacement links; it must not guess DOM events or secret-control semantics. Preserve exact output/redaction parity tests.
- Fact grammar/capability mapping moves beside `domain/src/runtime/facts/{query,evaluate,...}` and `domain/src/runtime/capabilities.ts`. Existing `host-runtime.ts` already registers fact/expectation evaluators. Add the authoring grammar binding through `domain/src/runtime/service.ts`/trusted host registration rather than importing downstream code from Core.
- Safe call wording already has real implementations in `domain/src/runtime/llm-evidence/node-run/{call-words,control-words}/` and registration in `llm-evidence/tools.ts` (`describeCall`). Reuse that typed trusted seam for model-facing/control-words, reset absorbed-action descriptions and activity action projection.
- Browser target identity, replay/verify, before/after state, fact evaluation and exact-item reacquisition already live in downstream host-runtime, llm-evidence/node-run and target-reacquire. Core carries opaque tokens and evidence receipts. It must not interpret selectors/URLs/ARIA to fill a missing port.

Observed persistence edges remain Studio adapters: `service/candidate-drafts/store.ts` uses `ProgramJsonStore` and candidate-draft.json with schema versions 1/2; `project-build/records.ts` creates `ProjectBuildRecordStore` from project/Flow paths; acts/toggles writers serialize ledger facts; `storage/project/candidate-verification/store.ts` owns durable claim SQL; recovery writes proposals/adaptation/application/run detail. A canonical source must not import those stores even type-only. Authoritative read, absent, stale, unsupported storage and failed read are distinct outcomes.

## 5. Safety invariants that gate every unit

1. Build the whole Flow before its requested whole trial; finish only on a judged whole run of the exact final revision. Partial/same-Flow historical trials may inform a draft, never authorize promotion of an untested revision.
2. Repair on the failed step from the state the test left; check the repaired path there; restart whole only when ready. Preserve per-node first attempt plus three retries and host target reacquisition/identity rules on all paths; a lasting effect of uncertain outcome is held rather than repeated.
3. Permission remains the canonical consequence gate's decision. Money/delete/send-or-publish need human authority independently of instruction wording. Writing/checking a candidate performs nothing and cannot erase its prior performed lasting effect.
4. Judge before/after change, not absolute site state; restore only this build's owned acts when needed for a meaningful trial. Never undo existing user data, infer item ownership from a name, or treat unresolved observation as restoration.
5. Keep creation purse, reserved judge/repair allowance, ask bound, retry/timeout/cancel semantics and each paid/reply receipt exact. No new reply/evidence/output caps, no silent shortening to fit, and no charged call represented as unsent.
6. Oracle facts stay authoritative and complete. Missing/withheld/unreadable evidence is unknown/unverified, not yes; computed failures cannot be overruled by a model; computed passes cannot replace required judging; unsupported promotion remains unsupported.
7. Fresh source/permission/settings/compiler/registry bindings and revision/digest checks remain before side effects and application. Unknown/pending durable claims do not replay; writes/flush failures cannot produce a fake saved draft, completed receipt or accepted artifact.

## 6. Sequencing and ownership coordination

Immediately dispatchable after a new brief: section 1 draft mechanisms plus coordinated destructive predicate and presentation adapter. It has no R5 storage/state dependency and does not require moving the full SDK.

After canonical interfaces stabilize, plan/script acceptance and strict verification controller/ledger-contract extraction can proceed as separate file lanes. Result DTO/deterministic comparison groups can proceed alongside them if all shared barrels/contracts have a single owner. Trial orchestration depends on canonical executable/native/IO/environment/host/state boundaries, receipt protocol split and ledger ports. Candidate/subflow gates depend on acceptance/draft/coverage and trial ports. Owned-act/witness mechanics coordinate with R6 permission/identity and downstream semantic adapters. Final result orchestration, repair and project-supervisor composition move last, once their imported capabilities and persistence ports are fixed.

Shared files that must be assigned/serialized: Studio runtime/model/root barrels; `flow-bootstrap/index.ts`; `llm` task/harness/evidence-loop contract exports; `service.ts`/facade ports; candidate/plan/result DTO barrels; permission destructive table; executable graph/engine trace exports; canonical feature public entries and guards; downstream trusted registration. No worker may extend ownership into those files by assumption.

Every completed unit adds transitive program-independent import guards, including erased imports; real old entry points delegate to canonical authority; old compatibility wrappers cannot retain the original active algorithm. No moving baselines to new paths, new import exceptions or catch-all copied authoring directory.

## Investigation and planned validation

Read-only `Get-Content`, `rg` and Node/TypeScript AST import/declaration inventories were used in paired Core/downstream. Inspected actual draft mutations, candidate gate, project supervisor composition/save, candidate trial start/run/rejudge, strict controller/durable claims, verification ask/reask, repair ports and path/store adapters. Observed the closed draft dependency cut and mixed ownership edges above.

No tests, typechecks, builds, audits, model/provider calls, browser or panel operations were run for this planning brief. No implementation behavior has been newly verified. Acceptance commands in new source briefs should name only the relocated canonical subject tests and retained adapter tests, with package typechecks/export checks and shared integration reserved for the lead's source-stable checkpoint. Existing original-dev comparison should be used if a moved test reveals an ambiguous preexisting oracle failure; do not weaken it.

Implementation is not begun. SOURCE FROZEN; the lead's next authorized source work is the R5 state/recording group in a new paired task, coordinated with SDK DTO ownership.
