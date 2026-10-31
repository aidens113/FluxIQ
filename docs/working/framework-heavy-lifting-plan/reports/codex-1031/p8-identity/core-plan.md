# Core plan: identity recovery without source-node lineage

Plan only, source frozen at the private t828 setup. No implementation, checks, builds, browser sessions or provider calls were performed. This proposal incorporates the lead's decisions: keep `reacquireTarget` unchanged; add a separate optional method; authorize refreshable fields through canonical registered parameter declarations, not through the host answer or Flow metadata.

## Observed seams and the necessary bridge

`executor/target-reacquire/step-reacquire.ts` currently returns immediately when `automationStudioTargetLineage` finds no row/output source. The shared retry timing and `automationStudioStaleTargetFailure` predicate already provide the required trigger and uncertain-act protection. Keep both.

Actual parameter resolution currently occurs later, in `executor/node-execution/attempt.ts:85-96`: rewrite symbolic node-output references, then resolve against Flow inputs, live run variables, run values and collected node inputs, in that precedence order. Passing `node.parameterValues` to a new hook would pass unresolved bindings for Flow inputs and variables. Reuse that exact resolution through a pure leaf helper.

`nodes/registry.ts:getAutomationNodeDefinition` sees only builtins. Importer definitions live on `AutomationStudioNativeNodeRuntime.sdk`. Its existing `resolveActionEffect` already recognizes recorded `builtin.policy.action` wrappers and looks up registered `outputAction` declarations using the resolved `outputId`. A narrow registry bridge is therefore necessary. Marking the wrapper's whole `parameters` object refreshable would authorize changing arbitrary action arguments; do not do that.

## Candidate additive public interface

Names and shapes below are a concrete candidate for the lead to freeze. Existing source-bound request/answer types and `reacquireTarget` callers remain byte-for-byte compatible.

```ts
// Add to AutomationNodeParameter, in nodes/contracts.ts.
// Only a canonical registered definition grants this opt-in.
targetRefresh?: true;

export type AutomationStudioTargetRefresh = {
  // Flat registered output parameter IDs, applied in one fixed container.
  // output means node.parameterValues.parameters; node means parameterValues.
  container: "node" | "output";
  definitionId: string;
  definitionVersion: string;
  parameterIds: readonly string[];
  // Subset of parameterIds whose canonical descriptor is not required.
  removableParameterIds: readonly string[];
};

export type AutomationStudioTargetRefreshResolution =
  | { kind: "declared"; refresh: AutomationStudioTargetRefresh }
  | { kind: "absent"; reason: "unregistered_definition" | "no_refresh_declaration" }
  | { kind: "rejected"; reason: "ambiguous_definition" | "invalid_declaration" | "invalid_output" }
  | { kind: "unreadable"; reason: "registry_unreadable" };

export type AutomationStudioTargetRefreshPatch =
  | { operation: "set"; parameterId: string; value: JsonValue }
  | { operation: "remove"; parameterId: string };

export type AutomationStudioUnboundTargetReacquireRequest = {
  // Original node, supplied as an isolated readonly snapshot.
  node: AutomationStudioFlowNode;
  // All actual resolved node parameters, including the policy wrapper when
  // present. No raw $state placeholders are substituted for resolved values.
  parameters: Readonly<Record<string, JsonValue>>;
  refresh: AutomationStudioTargetRefresh;
  // Existing generic attempt context for the host's resource/place memo.
  previousAttempt: {
    attemptId: string;
    beforeAction?: AutomationStudioHostStateSnapshotRef;
  };
  failure: AutomationStudioFailureRecord;
  signal?: AbortSignal;
};

export type AutomationStudioUnboundTargetReacquireAnswer =
  | { outcome: "found"; patches: readonly AutomationStudioTargetRefreshPatch[] }
  | { outcome: "gone"; coverage: "complete" }
  | { outcome: "unmatched"; reason: "ambiguous" | "unidentifiable" }
  | { outcome: "unavailable"; reason:
      "observation_unavailable" | "observation_incomplete" |
      "place_unproved" | "unsupported_target" };

// Optional addition to AutomationStudioHostRuntimeBoundary.
reacquireUnboundTarget?(
  request: AutomationStudioUnboundTargetReacquireRequest
): AutomationStudioUnboundTargetReacquireAnswer |
   Promise<AutomationStudioUnboundTargetReacquireAnswer>;

// Optional trusted addition to AutomationStudioGraphExecutionOptions.
// This is registry access, not a write-set supplied by the matching host.
resolveTargetRefresh?: (
  node: AutomationStudioFlowNode,
  parameterValues: Readonly<Record<string, JsonValue>>
) => AutomationStudioTargetRefreshResolution;
```

`Unbound` means no source-node lineage; parameters may still be bound to Flow inputs or variables. Populate `previousAttempt` from the retried attempt's real `attemptId` and optional `stateRefs.beforeAction`, preserving the existing snapshot-reference type. The host can use its own per-attempt memo or the reference to prove the current resource/place/document is the failed target's context; it must answer unavailable/place_unproved when that is absent or mismatched. No URL, tab, frame or other browser concept enters the Core type. The host receives no fabricated source, source ID, lineage, source candidates or mutable run state.

The paired host planner confirmed this exact context shape. Its existing location-only memo cannot itself prove document/resource continuity; the paired host plan adds private capture provenance keyed by the existing state reference. Missing/evicted correlation is unavailable. Evidence proving a containing resource's document does not prove a nested resource's document; a host without prior scoped provenance must decline that scope. Core carries those opaque references and never infers broader coverage from them.

`AutomationStudioNativeNodeRuntime.resolveTargetRefresh(node, parameterValues)` returns that typed resolution. `automationStudioRunGraphOptions` wires the callback beside `resolveActionEffect`, using the same native runtime instance. Ordinary nested-frame options already spread these options; do not put an arrival overlay into graph options, where a child could inherit its parent's target.

For an ordinary registered node, resolve its exact canonical ID/version and select only parameter descriptors with `targetRefresh === true`, using container `node`. For `builtin.policy.action`, keep the original wrapper and resolve its actual `outputId` against registered `outputAction.fixedOutputId/allowedOutputIds`; require one exact matching canonical output definition and a valid plain output-parameter container. Snapshot the output definition's own version; the wrapper's definitionVersion pins the wrapper and must not be misread as the output's version. Use container `output`. Zero matches is absent; multiple matches are rejected, with no guessing or union of write authority. Return copied, validated IDs. Neither the wrapper's `outputId`, `requiresApproval`, confirmation, timeout, failure route nor its complete `parameters` object is writable.

Validate `targetRefresh` at canonical definition registration: absent or literal `true` only. Reject duplicate IDs and invalid IDs through the owning definition validator; new target-refresh declarations must not opt in a parameter named by that definition's conditional `actionEffect.commitWhen`. The flag never derives from a Flow parameter, adaptation, model-authored metadata or hook response. Old manifests require no flag and retain their existing behavior. The downstream marks only its canonical `selector` and `element` descriptors, as established by the paired host planner.

## Trigger, dispatch and rebinding

1. Preserve the current checks for a pending previous retry, once per arrival, the configured reacquire attempt, stale-target failure, and the completed-act ledger. Reacquire before attempt 4 when the policy permits at least four attempts; for policies of two or three attempts, before the last. It spends no attempt.
2. If lineage exists, take the existing source-only branch without modification. Its read-only source gate, source-place handling, internal rerun, candidate completeness, matcher and row/output rebinding remain authoritative. Never fall through to source-less search after a source failure, ambiguous answer or unavailable source.
3. With no lineage and no new optional host method, return exactly as today: no host request and no new record. With the new method present, mark the eligible arrival once and enter the new branch.
4. Resolve parameters with the shared pure helper, using the same merged values the actual dispatch will see. Missing bindings produce `unavailable/unresolved_parameters`; do not ask the host and do not let a patch repair or erase a missing binding. The normal execution seam still produces its own unresolved-parameter failure.
5. Obtain the trusted refresh declaration before calling the host. Absent/rejected/unreadable declaration, empty allowed fields, absent resolver or unusable fixed container produces a closed unavailable reason; no observation or patch installation. Snapshot the declaration, the target slots' original presence/values, original resolved parameters and original action floor before the asynchronous call.
6. Pass isolated snapshots of the node, parameters, failure, previous-attempt context and refresh declaration. TypeScript readonly alone is insufficient: never give the host aliases to Flow parameters, variables, registry descriptors or shared run values. New defensive reflection/copying returns explicit `absent`, `rejected` or `unreadable` diagnostics; catches never silently return undefined/null or retain page/error text.
7. Call the hook once. It may perform bounded, read-only observation only after proving the same resource/place/document from the previous-attempt context; it may not perform the failing act, a lasting act, a model call, a source rerun or navigation to guess the lost context. Unknown or changed place is unavailable/place_unproved even if an unrelated current view contains a uniquely matching kind of control. Saved stable identity is required by the host contract. A selector, position or old handle alone cannot establish it. Missing fingerprint means unmatched/unidentifiable or unavailable, never a blind address fallback.
8. Validate the complete answer before applying anything. Found patches are atomic and constrained to the copied declaration. A gone answer requires explicit `coverage: "complete"` plus the host's positive complete observation of the relevant scope. A missing, unreadable, empty or partial observation never proves absence. A naked `{ outcome: "gone" }` is malformed and does not suppress dispatch.
9. Check cancellation again before installing patches. On cancellation, discard the answer and let arrival's existing post-hook cancellation path end the run. Do not convert cancellation to gone, success, or a fresh dispatch.
10. Found installs a private per-arrival parameter overlay. Gone uses the existing synthesized `executor.target.gone` attempt and normal failure route, with no remaining action dispatch. Unmatched/unavailable installs nothing and leaves the ordinary remaining attempt and its real result intact. A host throw is unmatched/host_failed; malformed data is unmatched/malformed_answer; invalid patches are unmatched/invalid_patch. Only found/gone emits the existing generic recovery activity, with no source label.

### Exact patch/removal rules

- Require an ordinary closed answer record. Found carries a nonempty ordinary patch array; patch objects allow only the exact keys of their declared operation. Reject unknown operations, unknown fields, accessors/unreadable objects, non-JSON values, cycles and prototype-sensitive keys; preserve null as a JSON value. Keep existing canonical parameter and normal execution validation in place; the refresh seam must not bypass it or reinterpret rejected values as a successful match.
- Every `parameterId` must equal a declared allowed flat ID exactly. Reject duplicates, including a set/remove pair for the same ID. No dotted paths, arbitrary nested paths, parent-object replacement, implicit merge or node replacement.
- A set may create an optional allowed field that was absent. Replace that one complete parameter value with a copied JSON value; replacing a marked `element` object is allowed, because its complete identity/address representation is the registered target field.
- Remove is allowed only for an allowed field listed in `removableParameterIds`. It cannot remove a required field. Delete the own property on a new fixed-container record; do not write undefined or null as a substitute. Removing an already absent optional field is harmless. All changes are accepted together or none are applied.
- Keep every non-target parameter structurally unchanged. For the policy wrapper, copy the wrapper and its existing `parameters` record, then change allowed output parameter IDs inside that record only. All wrapper fields and the Flow node's ID, definition/version, metadata, approvals, consequences and adaptations remain original.

### Distinguish the two overlays

The existing `ctx.arrival.overlay` is a run-value overlay for a source-bound output. `graph-run.ts` merges it into `nodeValues`; that behavior stays as it is. It cannot represent replacing a literal or Flow-input/variable-bound parameter without changing the state that other nodes read.

Add `ctx.arrival.parameterOverlay` for the new branch. It holds a copied refresh scope, validated patches, the original allowed target slots' presence/values and the pinned trusted action floor. It is not a Flow node and is not serializable run state. The actual node execution receives it through an optional trailing internal argument to `executeAutomationStudioNode` and `AutomationStudioNodeAttemptExecution.execute`; existing callers omit that argument unchanged.

Within the attempt, first resolve the original authored parameters normally and retain the original missing-binding behavior. Then apply the overlay to that resolved parameter map. Both the execution-node clone and the built-in execution context use the refreshed map, so native, policy-effect and host-state paths agree. Keep incoming Flow/wired inputs, `values`, variables, other nodes and the stored Flow untouched. Trace inputs still describe their original shared inputs; only execution parameters receive the fresh target.

Reapply the accepted target patches on every remaining retry of that arrival while resolving all other parameters anew. Before each application, check that the current target slots and the definition/container identity still equal the saved unrefreshed baseline. If an On Before handler or repair changed the target binding, discard the stale overlay through an explicit `rejected/binding_changed` result and use the new original binding; never overwrite a later deliberate target change. The hook remains once per arrival. Leaving the node destroys the overlay; re-entering or a later For Each pass starts clean. Do not reset shared values to achieve this.

## Effect, authority and actual-outcome floors

Do not pass a host-provided node to the executor or use host-provided effect, idempotence, permission or approval fields. Only a validated target patch reaches execution. Original Flow identity, command-entry digest, native grants, domain authorization and wrapper output identity remain unchanged.

Snapshot the trusted floor of the preceding failed attempt and resolve the unrefreshed current parameters' floor before accepting an overlay. Resolve the proposed refreshed parameters through the same trusted `resolveActionEffect`, never through the host answer. Use `combineAutomationStudioResolvedActionEffects` to pin their union for this arrival. A refreshed value cannot lower commit/state classification, drop permission consequences or manufacture repeat safety. The union is a safety floor and is never a grant: if the refreshed target introduces a stronger action class or new permission consequences than the original unrefreshed action, reject the patch as `authority_changed` and keep the original binding; do not invent an approval or widen a grant.

The wrapper `executeAutomationStudioNode` currently resets the node's action-effect entry before preparation, and `attempt.ts` resets it again after parameter resolution. Both sites must explicitly retain the arrival's pinned floor when an overlay is supplied. At entry combine the raw declaration with the pinned floor; after resolution combine the original resolved floor, refreshed floor and pinned floor. The existing actual-output dispatch already combines its output floor, and must continue doing so. A resolver throw or invalid declaration remains a real pre-dispatch `executor.action_effect.resolve_failed`, with no dispatch; it cannot erase the pinned floor or be treated as an unacted successful recovery. Clear arrival pins only on leaving the node, not between its retries; do not leak them into a later pass.

The stale-target predicate, effect-check `landed/unknown` refusals, `stateHeld`, skipped/uncertain attempts, required-command outcome latch and completed-act ledger are unchanged. A successful identity match never overrides any of them. Recheck cancellation and completed-act state after the asynchronous observation before committing the overlay/dispatch decision.

## Trace and compatibility

Keep the old source record member unchanged, and widen `AutomationStudioTargetReacquireRecord` with this separate member:

```ts
type AutomationStudioIdentityReacquireRecord = {
  kind: "identity";
  sourceNodeId?: never;
  returned?: never;
  outcome: "found" | "gone" | "unmatched" | "unavailable";
  reason?: AutomationStudioIdentityReacquireReason;
  at: number;
};

type AutomationStudioIdentityReacquireReason =
  | "ambiguous" | "unidentifiable"
  | "observation_unavailable" | "observation_incomplete" | "place_unproved" | "unsupported_target"
  | "no_refresh_declaration" | "scope_rejected" | "scope_unreadable"
  | "unresolved_parameters" | "parameters_unreadable"
  | "host_failed" | "malformed_answer" | "invalid_patch"
  | "binding_changed" | "authority_changed" | "action_effect_unavailable"
  | "aborted";
```

`executor/contracts.ts` already references the record type; preserve its containing attempt shape. Update run-detail conversion to branch on kind and write only kind/outcome/closed reason for identity. Do not emit sourceNodeId with undefined, an empty string, the current node ID or a fake source; omit source-only `returned`. Do not persist request parameters, patches, fingerprints, candidates, page evidence or host error text. Internal `at` stays on the attempt record as today, with run-detail timing handled as today.

The public run-detail metadata is already JSON-shaped, so no new `@fluxiq/contracts` trace schema is needed. Existing activity recovery kind `reacquire` and its source-less wording already exist; no activity wire enum expansion is needed. The widened executor record discriminant is an API compatibility consideration for exhaustive consumers: keep old members assignable and fix any owning consumer to narrow `kind`. Existing source-hook `Pick` consumers and unmodified host implementations continue compiling because neither their method nor their request/answer changes.

## Bounded file ownership and exports

Core owns the following bounded edits; the paired host report owns downstream declarations, observation and matching.

| Owner paths | Required work |
| --- | --- |
| `nodes/contracts.ts`, `nodes/definitions.ts`, `nodes/tests/canonical-registry.test.ts` | Optional true-only `targetRefresh` declaration; canonical validation, duplicate/conditional-effect-field rejection and preservation through adaptation. |
| `runtime/native-node-runtime.ts`; new `runtime/executor/parameter-refresh/resolve.ts` | Thin native registry method delegates to a pure focused resolver; unique output lookup and fixed node/output container. |
| `runtime/executor/contracts/graph-execution-options.ts`, `runtime/service/runtime-session/graph-options.ts` | Optional trusted `resolveTargetRefresh` type and native factory wiring. |
| New `runtime/executor/parameter-refresh/` leaves | Separate public declaration/resolution/patch types, private overlay type, actual-input resolution helper, patch validator/application and effect-floor helper. One exported value per implementation leaf; an index barrel. |
| New `runtime/executor/unbound-reacquire/` leaves | Public request/answer types and identity record/reason types; defensive host-answer reader; source-less step orchestrator; index barrel. |
| `runtime/host-runtime.ts` | New optional ordinary method, with contract comments. |
| `runtime/executor/target-reacquire/contracts.ts`, `step-reacquire.ts`, `index.ts` | Add identity record member and branch after unchanged common gates; preserve existing source algorithm and request/answer. |
| `runtime/executor/step-loop/loop-context.ts`, `runtime/executor/graph-run.ts`, `runtime/executor/node-execution.ts`, `runtime/executor/node-execution/attempt.ts` | Distinct arrival overlay, optional internal forwarding, shared original resolution, overlay application and pinned floor at both reset points. |
| `runtime/service/summaries/conversions.ts`; optionally focused `runtime/service/summaries/reacquire.ts` | Project record by discriminant, omitting all source-only/data fields for identity. |
| `runtime/executor/index.ts`, existing relevant barrels | Re-export new public request, answer, refresh, resolution and patch types. `runtime/index.ts` already exports host runtime; use existing public automation-studio entry chains, no new package subpath. |
| Collocated tests listed below; authored architecture and paired working-document state owned by lead | Direct behavioral acceptance and durable current design. No runtime artifacts. |

Use leaf imports for value helpers to avoid native-runtime/executor barrel cycles. Type-only imports may cross the public barrels. Do not add helpers to oversized `graph-run.ts`, the attempt class or native runtime beyond their small wiring changes. New sibling directories `parameter-refresh/` and `unbound-reacquire/` avoid a third `target-*` prefix group and avoid deepening source beyond the existing path-depth budget. Do not create `target-reacquire/identity/` as a source nesting layer.

Existing audit limits are 800 lines per file (400 advisory), 25 files per directory (15 advisory), one exported class/component, 15 exported values (8 advisory), 40 class methods (25 advisory), prefix grouping at three, and nine path segments. New leaves should stay well below these; type declarations do not count as exported values. Do not expand a baseline or suppress an audit to fit this feature. New catches/reflection must preserve the typed absent/rejected/unreadable diagnostics required above. If existing coordinator baselines prevent even wiring growth, extract one complete owning responsibility in the same unit rather than adding a new allowance.

## Direct regression matrix

| Case | Required observed result |
| --- | --- |
| Old row/output recovery | Same host request, internal source rerun, candidates, fresh row/run-value overlay, source-place record and attempt accounting. New hook is never called. |
| Source branch unavailable/ambiguous | Existing behavior; no source-less escape branch. |
| Old consumer with no new method/resolver | Compiles and runs unchanged; source-less node still has no new request/record. |
| Literal target with stable identity | Three no-effect stale failures; one hook before attempt 4; native/policy dispatch receives only fresh target fields; same semantic action. |
| Flow-input and live-variable bindings, no source lineage | Hook sees fully resolved selector/identity, with precedence identical to the actual attempt; saved Flow and caller inputs/variables remain unchanged. |
| Missing binding/fallback | Existing fallback resolves as before; truly unresolved binding never becomes executable through a patch. |
| Native node versus policy wrapper | Native patches flat node target IDs; policy patches flat output target IDs inside parameters; outputId/approval/other wrapper fields remain fixed. |
| No flag/unregistered/ambiguous definition | Typed unavailable before observation; neither old selector nor model/host-declared metadata grants a write-set. |
| Undeclared/duplicate/unknown/prototype patch ID; extra keys; unreadable/malformed values | Whole found answer rejected; no partial changes, no lost failure or page text in diagnostics. |
| Remove optional/required target | Optional removal produces absent own property; required removal rejected atomically. |
| Non-target content/effect/authority fields | Cannot be patched. A registry conditional-effect field cannot opt in. A lower refreshed floor cannot lower safety; stronger/new authority is refused. |
| Remaining retries/arrival isolation | With six attempts, hook runs once before 4 and patches reach 4-6; later node/pass sees original shared values and no inherited overlay/floor. |
| Target deliberately changes during retry lifecycle | Explicit binding_changed; stale patch does not overwrite the new target. Unrelated live-variable parameters still update normally. |
| Policies with 1/2/3/4/6 attempts | No hook for 1; hook before last for 2/3; before 4 for 4/6; no extra attempt or search retry. |
| Ambiguous/no identity | No fresh target and no inferred gone; ordinary remaining attempt retains its actual outcome. |
| Resource/place/document changed or unproved | Real previous attempt ID/state ref is supplied; unavailable/place_unproved even when the new place has a uniquely similar control. No guessed navigation. |
| Complete gone versus partial/unreadable/empty observation | Only explicit positively complete scoped absence suppresses dispatch; missing completeness marker is malformed. |
| Host throw/malformed answer/abort | Closed host_failed/malformed_answer diagnostics; abort ends cancelled with no fresh dispatch. No thrown host text persisted. |
| Landed/unknown effect, held/skipped/uncertain work, completed act, already-gone target | No new hook or action; existing uncertainty/completion protection wins, including completion/cancellation while hook awaits. |
| Floor resolution failure before/after overlay | Actual pre-dispatch action_effect.resolve_failed; no dispatch, lowered floor, forged success or bypass of required-command handling. |
| Public conversion/activity | Identity kind with no sourceNodeId/returned or target data; original row/output JSON and activity remain unchanged. |

## Future narrow acceptance commands

These commands are proposed acceptance after implementation, not executed in this plan. New tests belong beside their subject; split the current source-bound integration test from the new source-less matrix rather than growing one test file indefinitely.

```powershell
pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/unbound-reacquire/tests src/programs/automation-studio/runtime/executor/parameter-refresh/tests src/programs/automation-studio/runtime/executor/target-reacquire/tests src/programs/automation-studio/runtime/service/summaries/tests/reacquire.test.ts
pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/node-execution/tests/action-effect-frames.test.ts src/programs/automation-studio/runtime/executor/outside-graph/tests/reacquire.test.ts src/programs/automation-studio/runtime/executor/outside-graph/tests/action-effect.test.ts src/programs/automation-studio/runtime/executor/defensive/tests/lasting-act-client-floor.test.ts src/programs/automation-studio/nodes/tests/canonical-registry.test.ts
pnpm --filter fluxiq check
pnpm structure:check
```

Add a focused `runtime/tests/target-refresh.test.ts` for native-runtime method plus graph-options wiring, using existing native-runtime fixtures; include that file in the first focused command once authored. Add a focused parameter-resolution test that covers Flow inputs, current variables, precedence, fallback and unresolved slots. Validate source-wrapper and native dispatch through the real execution seams, not solely a pure patch helper.

Downstream owning checks, SDK build/currency and a provider-free realistic browser proof are specified by the paired host plan. No full sweep, browser, paid run or implementation is authorized by this planning report. Both daily full-sweep allowances are already used; future paid validation remains held for explicit go and the existing Claude/$5 rule.

Outcome: Done
Changed: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/core-plan.md` only
Validation: not run (plan-only)
Not verified: implementation/runtime/types/browser
Report: `C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/core-plan.md`
Notes: Exact additive candidate provided for lead freeze; registered target field metadata needs a narrow native-registry bridge. Source-bound recovery stays unchanged. No source/test/runtime edits or checks.
