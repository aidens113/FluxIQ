# Execution-options copy migration plan

REPORT FROZEN. Read-only discovery completed; no source, tests, configuration or baseline changed and no checks ran in this unit.

Dispatch: [binding-review brief](../briefs/execution-options-copy-migration-discovery.md). Initial locations and the previously observed 29-finding scan come from the [frozen guard report](execution-options-copy-guard.md); the classifications below follow the actual caller and private binding implementations.

## Required helper amendment before migration

Extend only `engine/automation/execution-admission/copy.ts` and its immediate tests first:

```ts
export function copyAutomationExecutionOptions(
  source: AutomationStudioGraphExecutionOptions | undefined,
  changes: Partial<AutomationStudioGraphExecutionOptions> = {},
  parent?: ExecutionObservationContext | null
): AutomationStudioGraphExecutionOptions {
  const target = { ...source, ...changes };
  if (source) {
    if (parent === null) AutomationRetrySeries.inherit(source, target);
    else inheritAutomationExecutionObservation(source, target, parent);
  }
  return target;
}
```

Use the existing canonical context type and existing private series owner. Do not change `inheritAutomationExecutionObservation`, `AutomationObservationBindings.bind`, their registries or their refusal semantics. The optional third parameter is additive; current two-argument callers keep their exact behavior.

- Omitted/undefined parent: preserve the **same original observation**, including its source, run proof/reader and current prepared invocation, plus retry series.
- Actual parent: the existing inheritance routine calls the original source's `forRun(parent, originalProof, capturedReader)` or `forParent(parent)`. The original prepared invocation is intentionally not copied into a different parent. Only a real privately entered parent is appropriate; this is not issuance from public data.
- Explicit null: copy public values and existing retry series, leave the fresh target **unbound**, then let the existing actual prepared binder attach its original child. Null does not grant an observation, create a parent, clear history or authorize a retry.
- An absent/unobserved source stays unobserved even when a parent is passed. An observed `changes` object never contributes private authority; only `source` does. Preserve the configured fallback binder where one already exists.

No flagged ordinary copy needs a new parent merely because it carries a public `invocation` field. The trial-specific binders below also perform fallback/read-only decisions and must remain in place.

## Exact initial sites

Paths are relative to `packages/fluxiq/src/`. **Seven of 29 targets require deferred observation binding**; the remaining 22 have ordinary preservation semantics, including one child-override merge whose authority must come from a separate original parent.

| Owner/path | Original line(s) | Required transformation and retained behavior |
| --- | --- | --- |
| `engine/automation/compiled-plan/run.ts` | 10 | Default copy only on the existing `startNodeId` branch; retain the original options object on the other branch. Keep plan/default precedence. |
| `engine/automation/composite/boundary.ts` | 73 | Keep the original rest destructuring that strips parent `startNodeId`, `stopAfterNodeId`, `invocation`. Copy `childBase` with `request.childOverrides` as **changes**, then fixed inputs/defaults/deadline, then retain explicit inheritance from **parentOptions**. Never use childOverrides as the authority source. |
| same | 82 | Default copy of childOptions with signal and optional framed invocation; retain whole-child uncertainty/repeat-stop handling. Public frame does not select a private observation parent. |
| `engine/automation/composite/execution.ts` | 98, 119, 122 | Default copies of executionOptions, options and rootOptions respectively; preserve inputs/executor/region plan, root invocation/deadline, then bounded signal. Retain original registered orchestration callbacks. |
| `engine/automation/environment/executor-options.ts` | 25 | Default preserve; source getters precede environment clock/wait getters. Keep live random/startTimer absence and existing offline overrides. |
| `engine/automation/execution-admission/internal/driver.ts` | 59 | **Null-defer.** After actual `callbacks.prepare` has entered, preserve the existing exact `create(this, parent, observed.run, invocation)` binder. A parent-only helper binding would omit the prepared invocation and conflict with this binder. |
| `engine/automation/frames/graph-frame.ts` | 73 | Default copy only when existing invocation differs; preserve the original-object branch and exact stack push/pop behavior. |
| `engine/automation/graph-run.ts` | 436, 446 | Default copies only on existing branches. At 436 retain the explicit private series binding: fresh for a successful new pass, same for scheduled retry. At 446 inherit that series through the bounded-signal copy. Do not reset arrival/progress/retry counters. |
| `engine/automation/resume.ts` | 68 | Default copy; preserve parked start/path, seed trace and settlement behavior. Do not run the parked node again. |
| `programs/automation-studio/runtime/compiled-plan.ts` | 18 | Default preserve plus legacy classifier; preserve source-spread-before-classifier-getter order. |
| `programs/automation-studio/runtime/composite-executor.ts` | 9 | Same; existing same-observation inheritance is redundant but safe until focused verification. |
| `programs/automation-studio/runtime/executor/graph-run.ts` | 7, 12 | Default preserve in run and resume wrappers plus legacy classifier; preserve its getter order. |
| `programs/automation-studio/runtime/executor/resume.ts` | 8 | Default preserve for nested options only; keep the separate whole-request spread and all its own fields. |
| `programs/automation-studio/runtime/flow-bootstrap/verification/detached-execution.ts` | 41, 129 | Default preserve. At 41 retain subsequent inputs-only structuredClone, referenceNow deletion/conditional re-add and signal timing. At 129 retain child-specific diagnosis/patch/budget overrides and exact produced-graph lookup. |
| `programs/automation-studio/runtime/flow-change/trial.ts` | 74 | Default preserve, seeded inputs, then existing startNodeId set/delete. Keep absent distinct from undefined. Existing hostProxy callback-identity hazard is separate from this copy migration; do not claim this change fixes or certifies that path. |
| `programs/automation-studio/runtime/live-patch.ts` | 376 | Default preserve with optional currentSubflowId; retain no-remaining-budget branch and invalid-budget refusal. Also migrate the later inferred copy at 379. |
| `programs/automation-studio/runtime/recovery/annotation/annotate.ts` | 671 | Default preserve only when graphOptions exists; retain existing max prior-attempt calculation and surrounding conditional/argument order. |
| `programs/automation-studio/runtime/service/candidate-trial/run.ts` | 180 | **Null-defer**, then retain `inheritCandidateTrialExecutorObservation(request, graphOptions, referencedOptions)`. It reparents to the actual current callback, preserves original run proof, supplies configured fallback if unbound, and deliberately declines observation for read-only invocation. |
| same | 185 | **Null-defer** while pinning values before parentFlow/snapshot awaits. Keep the no-trial-parent immediate binder and the execute observer's prepared-parent binder at 195. |
| `programs/automation-studio/runtime/service/runtime-adaptation/repair-rerun.ts` | 186 | Default preserve; keep the original third-argument evaluation position between the two awaited catalogue reads, referenceNow choice, prior attempt count and optional resumed node. |
| `programs/automation-studio/runtime/service/subflow-trial/from-step.ts` | 99, 104 | **Null-defer both**, for the same two distinct stages as candidate trial. Keep actual-parent/fallback/read-only inheritance at 100, conditional immediate binding at 105 and entered execute parent binding at 122. |
| `programs/automation-studio/runtime/service/subflow-trial/run.ts` | 206, 211 | **Null-defer both**; retain binders at 207, 212 and the entered execute callback at 231. Preserve from-start/predecessor/session semantics. |

The two copies in each trial service are not interchangeable. Default-binding the first target makes its later actual-parent inheritance throw `execution_observation.options_already_bound` or accidentally observes an intended read-only path. Default-binding the second target prevents its execute-child binding after entry. Driver.prepare has the same refusal with an additional exact prepared-invocation requirement. Keep the refusal rather than allowing replacement.

## Evaluation and shape rules

`copy(options, { classifyLegacyStepAct: options.classifyLegacyStepAct ?? fallback })` is not generally equivalent to `{ ...options, classifyLegacyStepAct: options.classifyLegacyStepAct ?? fallback }`: call arguments evaluate before the helper spreads options. A stateful getter changes both event order and potentially the final value. Environment getters have the same issue.

For sites with evaluated overrides, first materialize `const base = copyAutomationExecutionOptions(options)` at the original spread position, then evaluate the changes and use `copyAutomationExecutionOptions(base, changes)`. The second copy sees plain own data. For deferred targets, every materialization remains null-deferred until the existing binder runs. Do not introduce an arbitrary lazy callback invoker or replace data-property spread semantics with a dynamic Object.assign.

Preserve all enumerable own string/symbol fields, including fields outside the declared interface, original callback/host/commandRun references, explicit undefined, property order, conditional branches and thrown getter behavior. Do not project only known fields, clone/freeze collaborators or infer authority from those fields. In the boundary, retain the existing destructuring before copying plain childBase: full-copying parent first would additionally evaluate deliberately stripped getters. Apply childOverrides only as changes, then explicitly inherit the parent companion as today.

Migrate to a fixed point. Two already visible downstream copies were not in the initial nominal 29 because prior inference erased the original declaration: `live-patch.ts:379` and `flow-bootstrap/verification/detached-execution.ts:117`. Both need default preservation after their first helper copy restores the canonical return type. The latter must keep its current input/signal/subflow/diagnosis/recovery/start overrides and public RootInvocation setup. Do not treat 29 replacements alone as completion or weaken the typed rule to hide subsequent findings.

## Safe execution order and acceptance

1. Release the additive helper/null behavior and immediate tests first. Prove default identity, authentic new-parent/run proof + captured reader receiver, null stays unbound while retaining original retry token, and existing original-child binder succeeds afterward. Copied/serialized source and an observed changes object cannot supply authority. Retain a negative different-observation rebind refusal.
2. Migrate canonical driver, environment/compiled/frame/graph/resume/composite owners and ordinary Studio wrappers. Keep every existing true binder; remove only provably duplicate same-observation calls if useful. Add getter-order/extra-own-symbol/absent-field checks at actual wrapper/boundary callers.
3. Migrate the six trial service targets with explicit null and existing conditional/entered-parent binders. Exercise both originally bound options and configured fallback. No new source registration, ambient parent, public DTO fields or source ownership changes.
4. Migrate recovery/live-patch/detached ordinary copies and inferred follow-on copies; rescan the one guard to zero without config/baseline changes. Validate the real recovery path retains its original private binding; the separate existing hostProxy hazard must remain explicit, not be silently treated as managed identity.

Focused selectors for the future implementation (not run here), all under `packages/fluxiq/src/`:

- `engine/automation/execution-admission/tests/copy.test.ts` and `producers.test.ts`: original counter-act-then-throw, registered compute-only rejection ordinary retry, forged unacted result, lost acknowledgement, two authored invocations, two effect ordinals and successful same-node self-loop without counter reset. Add a scheduled-retry series preservation assertion across the migrated bounded copies.
- `engine/automation/environment/tests/executor-options.test.ts`, `compiled-plan/tests/run.test.ts`, `composite/tests/run.test.ts`, `frames/tests/invocation-frame.test.ts`, `tests/resume.test.ts`: existing timing/grants/nested invocation/start/parked-node oracles. Extend actual wrappers with getter event order and unknown own-field retention; boundary asserts stripped fields are absent and child override companion never wins.
- `programs/automation-studio/runtime/candidate-trials/authority/tests/executor-observation.test.ts`: existing original-bound true/false actual-parent and captured original reader checks. Exercise the helper-created deferred target before the existing custom binder.
- `programs/automation-studio/runtime/candidate-trials/partial/tests/native.test.ts`: existing four actual counter cases (`trial`, `from_step`, `direct_trial`, `direct_from_step`) with previously bound options. Counter stays one, history pending across revised gate, no start before admission. Also `parent.test.ts`, `required-engine.test.ts` and `read-only.test.ts`: exact admitted parent, actual engine descendant required, read-only diagnosis with no new reservation or live fallback.
- `programs/automation-studio/runtime/service/candidate-trial/tests/environment/tests/trial-environment.test.ts`, `service/subflow-trial/tests/environment.test.ts`, `reference-now.test.ts`, `from-step.test.ts`: preserve clock/channel/referenceNow and from-step start behavior. Include whole-candidate execute-child timing, not only partial tests.
- `programs/automation-studio/runtime/flow-bootstrap/verification/tests/detached-execution.test.ts`, `candidate-owned-subflows.test.ts`, `reference-now.test.ts`; `flow-change/tests/trial.test.ts`; `tests/live-patch.test.ts`; `service/runtime-adaptation/tests/repair-rerun.test.ts`; `recovery/annotation/tests/annotate.test.ts`: unchanged candidate identity/input/date/budget/attempt numbering/adopted execution tests, plus original observed counter at the production recovery entry.

After those focused tests, the implementation owner should run `node scripts/structure-audit.mjs --rule execution-options-copy --json`, the immediate Node guard fixtures, owned scoped structure checks and a source-closed strict check. Package integration remains lead-owned and coordinated. No new blanket same-function fence, purity declaration or unknown-outcome clearance belongs in this migration.

Outcome: Done
Changed: this report only
Validation: source/read-only inspection of the 20 flagged owners, existing binding/copy/series and trial binder implementations, and named focused test selectors; no tests, scans or builds run in this unit
Not verified: proposed helper/caller implementation, runtime behavior after migration, fixed-point guard/type/structure/package acceptance
Report: docs/working/runtime-ownership-refactor/reports/execution-options-copy-migration-plan.md
Notes: Seven deferred targets identified; keep original binders and single private registries. Getter/shape ordering and two already visible inferred follow-on copies are implementation requirements. All existing source remains frozen.
