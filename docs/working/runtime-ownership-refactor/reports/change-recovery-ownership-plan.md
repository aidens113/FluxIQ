# Change, recovery and training: first three implementation cuts

Status: READ-ONLY discovery complete. No source release, source edits, tests, builds, git or agents.
Dispatch: [change-recovery-discovery brief](../briefs/change-recovery-discovery.md).
Context: current t843 source and the relevant residual-runtime rows. Accepted router/action-permissions and result-verification implementations were not re-audited.

## 1. Close the actual trial boundary, then move change evidence

**Lead this cut with the actual production path:**
`service.ts` recovery annotation -> `recovery/annotation/annotate.ts:650` ->
`annotation/patches.ts:166,186` forwards original `graphOptions` ->
`live-patch.ts:274,280` -> `trialOptions():375` ->
`flow-change/trial.ts:74,80` -> real graph execution.

There are **three option-copy sites** on that path:
- `live-patch.ts:376` spreads the original options.
- `live-patch.ts:379` returns a second spread when a finite remaining-step budget is supplied.
- `flow-change/trial.ts:74` spreads again to install seed inputs/start node.

None calls `inheritAutomationExecutionObservation`. Private WeakMap admission/run/parent bindings are not spread properties. Separately, `trial.ts:77,237-281` replaces the host with an expectation-observing Proxy. It pins the original evaluator and calls it with the original host, but other host methods are returned as fresh bound functions. This preserves some receiver behavior while changing host/method identities used by configured callback coverage. These are source-proven hazards; no exploit/reproduction was run in this discovery.

**Owned old files:** `runtime/flow-change/**`, `runtime/adaptation-confidence/**`, and the exact whole-file owner `runtime/live-patch.ts`. The last remains the Studio adaptation/proposal composition owner; first repair its `trialOptions` path and delegate shared trial/evidence decisions. No other cut edits this root file.

**Canonical destination:** `engine/automation/change/{trial,evidence,replay}/**`; remaining pure verdict/confidence DTOs under `flows/executable/change/**`. Reuse canonical executable graph/options/trace types and component definitions. Preserve old exports as exact facades, including legacy wire literals and node adaptation metadata.

**Required mechanism:** inherit the original private observation into every actual option object passed onward, including the bounded-return branch, from the real current trial parent. Keep the original host untouched. Record expectation facts at the engine's actual evaluator call rather than substituting a host/method. A narrow private collector needs only:
```ts
type ChangeExpectationFact = Readonly<{
  attemptId: string;
  source: string;
  declaredCount: number;
  checkedCount: number;
  outcome: "passed" | "failed" | "unknown";
}>;
```
The engine emits it after the original receiver/method invocation and emits unknown before rethrowing an original evaluator failure. Empty/partial checks and conflicting sources remain unknown. Bind the collector privately to the actual trial options; it is diagnostic data, never an admission capability. Root must release the exact engine expectation-invocation leaf/companion contract before implementation. Frozen A1 persistence/authority contracts need no change.

Move the existing verdict/resume/confidence/attempt-projection/replay algorithms unchanged after this path is closed. Success/continuation alone remain no evidence; an undeclared record minimum cannot authorize resume; replaced retry attempts remain superseded; failure resets replay confidence; legacy missing validation kind means trial, unknown kind counts nothing; high/destructive changes need one extra replay.

**Actual persistence stays Studio:** `service/runtime-adaptation/adaptation-replays.ts` loads the original bootstrap record first, runtime record second, and writes back to that same kind. Its bootstrap-first distinction prevents writing results into an unsaved runtime projection. Canonical replay returns decisions/results only; no second history store. A run ID counts once. The replay recorder is called by the existing run-record composition after a run, so keep that integration oracle.

**Focused existing selectors:** `flow-change/tests/{trial,verdict,resume,confidence,attempt-projection,contracts}.test.ts`, `adaptation-confidence/tests/replay.test.ts`, `runtime/tests/live-patch.test.ts`, `service/runtime-adaptation/tests/adaptation-replays.test.ts`. In particular retain trial cases “is unknown, not a pass, when the host …”, “leaves every other member of the host runtime as it was”, full step-budget/start-node cases, retry supersession and saved-versus-executed trace withholding.

**New acceptance:** actual configured engine/native counter through the production live-patch caller, with/without remainingSteps and with/without an evaluator. Original host/receiver/method and required Context remain identical. Counter act-then-throw/forged unacted return leaves coverage pending; changed inputs/another candidate/reopened owner gives zero second send. Two distinct authored invocations still run once each. Pure verdict/resumable/confidence JSON never settles admission or clears unknown history.

## 2. Extract recovery decisions and training policy

**Disjoint old ownership:** `runtime/adaptive-orchestrator.ts`, `runtime/training-modes.ts`, and these explicit `runtime/recovery/` leaves only:
`deterministic-diagnosis.ts`, `structured-diagnosis.ts`, `diagnosis-chain.ts`, `plan.ts`, `llm-invocation.ts`, `recovery-deadline.ts`, `exploration-budget.ts`, `progress-guard.ts`, `exploration-outcome.ts`, `unresolved-failed-attempt.ts`, `adaptation-promotion.ts`, plus their immediate tests. Do not take the entire recovery tree.

**Canonical destinations:** `engine/automation/recovery/{classification,planning}/**` for attempt/graph decisions; `runtime/adaptation/{training,exploration}/**` for independent mode/budget/deadline/progress decisions. Keep Studio settings serialization, training UI/status projection, review/audit readers and persisted adaptation envelopes as adapters. Existing annotation/refuted-result/provider orchestration is separately named R7 work below.

The classifier prefers a valid structured failure, retains the legacy message fallback and hashes exactly the existing ordered signature fields (SHA-256, first 24 hex characters). Explicit saved failure signatures must not fall back to node identity. Validated, unapplied adaptations count as known; an applied adaptation recurring invites a fresh diagnosis. Preserve the `core.result.` finished-result distinction without reopening the accepted result-verification implementation.

Training metrics need only original run status/intervention counts and adaptation status/trigger/update time. Gates need their actual mode/budget/frozen-scope fields, canonical risk/kind and recomputed confidence. Use narrow readonly structural inputs, not project/service/run envelopes. `annotateRunDetailWithTrainingMode`, uncertainty presentation and `createAutomationStudioTrainingStatus` remain Studio projection functions using neutral metric results.

The patch-gate table is **already canonical** at `flows/executable/change/policy`; `service/adaptations/gates.ts` is a facade. Remove training's reverse import through that service facade rather than copying its table.

A generic planning input must project the exact consumed diagnosis/result fields from `llm/harness/structured-response.ts` and task results. Do not move provider requests, complete harness results or project context into a new generic contract. The present invocation rule intentionally combines deterministic-first decisions with the call site's existing mode/cost/approval gates; copying every gate into both layers would change allowed first-run behavior.

Budget ledger timers remain real lifecycle resources. Reuse `runtime/environment` original `now` and optional `startTimer` ports, preserving live defaults, deadline tie priority, clamp/default values, abort handling and idempotent release. A missing/unchanged state digest is no quiescence or no-effect proof.

**Real consumers:** `service/runtime-adaptation/resolve-context.ts:43` computes metrics and behavior; `recovery/annotation/annotate.ts` runs diagnosis/plan/patch decisions; `live-patch/target-override-check.ts:130` uses classification; service summaries compact it for presentation.

**Focused selectors:** `runtime/tests/{adaptive-orchestrator,training-modes}.test.ts`; immediate recovery `{deterministic-diagnosis,structured-diagnosis,diagnosis-chain,plan,llm-invocation,exploration-budget,progress-guard,exploration-outcome,adaptation-promotion,unresolved-failed-attempt}.test.ts`. Retain fabricated/wrong-kind confidence refusals, no-trial promotion refusal, judged-whole-run distinction, deterministic-first ordering, exact stop reasons and virtual/live timer cleanup. Add canonical import/erased closure and old-export identity checks.

## 3. Move graph repair and remaining immutable version mechanics

**Disjoint old ownership:** `runtime/live-patch/**` and `runtime/flow-version/**`, immediate tests. Cut 1 owns `runtime/live-patch.ts`; this cut does not edit it. Existing canonical graph-version and node-adaptation-ID facades stay facades.

**Canonical destinations:** `flows/executable/repair/**` for graph-unit traversal, insertion/replacement/overlay and graph validation; `flows/executable/version/**` for neutral version/judgment records/readers. Keep Node hash implementations in explicit server leaves/subpaths; do not introduce a Node-crypto edge into a browser-facing executable/client barrel.

Move actual unit graph/digest, replacement, handler-build, insertion, overlay and target-check algorithms. Preserve positions being excluded from unit digests, sorted node/edge serialization, alias treatment, unowned-unit refusal, unchanged input graphs and the before/after multiset of validation errors. Do not replace this with string matching or a permissive validator.

**Required graph prerequisite:** `live-patch/overlay-validation.ts:32-37` currently manufactures a blank Studio artifact with project `runtime-overlay` merely to validate nodes/edges. Canonical `validateExecutableFlow` already owns complete execution validation but requires a real complete executable contract. Root must release a narrow graph/handler/reachability validation seam over actual `ExecutableGraph` plus `ExecutableFlowValidationContext`, reusing the existing implementation, or supply the original full executable document from composition. No fabricated scope/interface/project envelope and no cast of a partial graph into a full Flow.

**Target semantics:** target override eligibility, failed-node re-aiming and opaque target payload placement are neutral. `target-override-check.ts` already requires a domain evidence validator; absence refuses. Keep matched/resolved/ambiguous/unavailable distinctions and original validator receiver. `recovery/annotation/target-evidence-check.ts` composes it from the actual failure/exploration evidence and bound domain runtime; it remains Studio composition. No Core scorer, DOM reader or implicit target normalizer should be introduced. Browser spelling found in context/parameter screens is redaction/key withholding, not a reason to move those whole mixed modules into this cut.

Remaining version algorithms are real: instruction digest, first-position/last-value executed graph version sets, metadata writers/readers and strict judged-trial receipt parsing. Instruction hashing must keep trim + title/NUL/body + sorted JSON bytes, duplicate multiplicity and null for no stated instruction. Invalid revisions stay unknown; no metadata key is not proof an empty version set was computed. `judged-build-trial/applied.ts` reads original saved graphs/instructions and the original created audit record; keep that Studio persistence composition, calling neutral identity helpers. Stored verdict/call-count JSON is historical evidence, never a private trial completion or retry grant.

**Real consumers:** `service/adaptations/unit-repair-change.ts:73` uses the same overlay/digest as a live repair; `runtime/live-patch.ts` uses it for execution; saved apply uses version readers after graph writes. Preserve both live and durable paths, not just pure helper tests.

**Focused selectors:** `live-patch/tests/{overlay,in-run-kinds,target-override-check}.test.ts`, immediate `flow-version/tests/flow-version.test.ts`, `flow-version/judged-build-trial/tests/judged-build-trial.test.ts`, `recovery/in-run-repair/tests/unit-contract.test.ts` and `service/adaptations` unit-repair integration subjects. Add unchanged-byte digest/metadata parity, graph error-delta parity, no mutation and a bare browser closure proving no Node hash path.

## Shared prerequisites and dispatch boundaries

Already available; reuse their exact original definitions/aliases:
- `flows/executable/change`: risk/status/proposal modes, validation results/kinds, origin parser and patch-policy table.
- `flows/executable/graph`, `engine/automation/contracts`, canonical component registry/control-flow definitions.
- `flows/executable/adaptation` IDs and `flows/executable/version` graph-version primitive.
- Execution admission/source/observation capabilities and `inheritAutomationExecutionObservation`.

Root-owned before dependent dispatch: split the remaining verdict/evidence/trial data from execution-private companions; freeze only the actual repair/diagnosis DTO/parser slice of `llm/harness/structured-response.ts` needed by planning/overlay; release the exact engine expectation fact emission seam; release the narrow graph-validation seam. No whole service Pick, source registry reopening, new ledger or new JSON authority.

Run cut 1 first because it closes the actual production copy/proxy path. Cut 2 supplies canonical classification/policy to cut 3; independent version/unit work in cut 3 may proceed once those shared inputs are frozen. Parent/package barrels, package exports, broad service wiring and shared docs stay lead-owned. Old facades let real callers retain their API while each owner changes.

Required R7 composition still named after these first three cuts: `recovery/runtime-exploration.ts`, `annotation/**`, `refuted-result/**`, context/repair-context, exploration-state observation and in-run persisted history adapters. They combine actual tool invocation, person/permission asks, provider accounting, project evidence and original adaptation writes. Their later extraction needs original configured producer/parent propagation at each actual callback, with the already accepted permission/router modules consumed unchanged. This report does not claim those mixed actors are fully neutralized by the three foundation cuts.

## Validation and return

Source inspection only: Current State, relevant residual rows, the named implementation families and the concrete consumers/contracts/tests listed above. No tests, package checks, build, provider, browser or source mutation ran. Proposed acceptance selectors are not observed passes.

Outcome: Done
Changed: this report only
Validation: named source and production call-path inspection -> three disjoint implementation cuts and explicit shared prerequisites
Not verified: runtime reproduction, type/build/test results; all await source release
Report: docs/working/runtime-ownership-refactor/reports/change-recovery-ownership-plan.md
Notes: R5 source remains frozen. No running processes from this discovery. Lead owns shared seam release and integration.
