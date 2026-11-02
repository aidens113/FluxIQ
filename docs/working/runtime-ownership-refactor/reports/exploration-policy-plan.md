# Exploration policy extraction plan

REPORT FROZEN. READ-ONLY source discovery. [Current authorization](../briefs/exploration-policy-discovery.md); [future implementation scope](../briefs/exploration-policy-implementation.md) remains unstarted. No tests, scans, builds or source edits ran in this discovery.

## Sole authorities and ownership cut

Move the actual definitions/methods from the four named Studio leaves into `runtime/adaptation/exploration/**` and `runtime/adaptation/deadline/**`. Leave exact named reexports/type aliases in the old files; no wrapper constructors, duplicated ledgers or compatibility copies. Existing `recovery/index.ts` exports those old leaves and can remain unchanged. Keep defining function/class names where needed to avoid changing their observable names; ownership does not require renaming existing public symbols.

The existing `ModelRunBudgetDiagnostic` authority is **runtime/agents/ledger/types.ts:36**, exported by `runtime/agents/ledger/index.ts`. It is already independent and contains the full six-code union plus required message. The Studio `llm/run-budget.ts` type is already its alias. Canonical outcome mapping must import the canonical type directly, not the Studio alias or a new shortened diagnostic DTO.

Promote only the exact twelve-member `AutomationStudioLlmEvidenceLoopFailureCode` declaration at `llm/evidence-loop/result.ts:17-60` to `runtime/agents/loop/failure-code.ts` as `EvidenceLoopFailureCode`, with `loop/index.ts`. That directory does not currently exist. Replace the old declaration by a type alias/import so its remaining result fields and failure factory still resolve the old local name. Do not move their graph steps, accounting, provider diagnostics or other result fields. Root owns agents/public parent exports.

Canonical dependencies are only core JSON, canonical agents ledger/loop types, canonical environment timer types, and the new local exploration/deadline leaves. No value OR type path may reach Studio. Retain the ceiling literals rather than importing the old evidence-loop limits: the existing source documents a real value-import cycle and an equality test already pins them.

## Complete legacy export map

Paths in this table are proposed leaves relative to `runtime/adaptation/`. Every listed legacy name remains exported under the identical old name and resolves to the one canonical definition; type rows remain aliases. Each leaf owns one exported authority and every directory has an index barrel.

| Old leaf | Existing export | Canonical leaf |
| --- | --- | --- |
| exploration-budget | type AutomationStudioExplorationScopePolicy | exploration/scope/contract.ts |
| exploration-budget | type AutomationStudioExplorationBudget | exploration/budget/contract.ts |
| exploration-budget | AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS | exploration/budget/defaults.ts |
| exploration-budget | AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS | exploration/budget/ceilings.ts |
| exploration-budget | resolveAutomationStudioExplorationBudget | exploration/budget/resolve.ts |
| exploration-budget | automationStudioExplorationScopeAllows | exploration/scope/allows.ts |
| exploration-budget | AutomationStudioExplorationBudgetLedger | exploration/budget/ledger.ts |
| progress-guard | AUTOMATION_STUDIO_EXPLORATION_NO_PROGRESS_REASONS | exploration/progress/values.ts |
| progress-guard | type AutomationStudioExplorationNoProgressReason | exploration/progress/reason.ts |
| progress-guard | AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS | exploration/progress/limit.ts |
| progress-guard | type AutomationStudioExplorationProgressStep | exploration/progress/step.ts |
| progress-guard | type AutomationStudioExplorationProgressVerdict | exploration/progress/verdict.ts |
| progress-guard | AutomationStudioExplorationProgressGuard | exploration/progress/guard.ts |
| progress-guard | automationStudioExplorationEvidenceDigest | exploration/progress/digest.ts |
| recovery-deadline | AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS | deadline/duration.ts |
| recovery-deadline | AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS | deadline/ceiling.ts |
| recovery-deadline | type AutomationStudioRecoveryDeadline | deadline/contract.ts |
| recovery-deadline | startAutomationStudioRecoveryDeadline | deadline/start.ts |
| recovery-deadline | automationStudioRecoveryDeadlineRemainingMs | deadline/remaining.ts |
| recovery-deadline | automationStudioRecoveryDeadlineExpired | deadline/expired.ts |
| exploration-outcome | AUTOMATION_STUDIO_EXPLORATION_OUTCOMES | exploration/outcome/values.ts |
| exploration-outcome | type AutomationStudioExplorationOutcome | exploration/outcome/contract.ts |
| exploration-outcome | AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS | exploration/outcome/stop/values.ts |
| exploration-outcome | type AutomationStudioExplorationStopReason | exploration/outcome/stop/contract.ts |
| exploration-outcome | AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON | exploration/outcome/stop/map.ts |
| exploration-outcome | AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE | exploration/outcome/loop-failure.ts |
| exploration-outcome | AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET | exploration/outcome/run-budget.ts |
| exploration-outcome | isAutomationStudioExplorationOutcome | exploration/outcome/is.ts |
| exploration-outcome | automationStudioExplorationCompletionOutcome | exploration/outcome/completion.ts |
| llm/evidence-loop/result | type AutomationStudioLlmEvidenceLoopFailureCode | runtime/agents/loop/failure-code.ts, old exact alias to EvidenceLoopFailureCode |

Additional cohesive budget input/timer resource leaves are reasonable if needed; they must not become another spending store. The proposed deepest stop-map path is nine segments, within the existing limit. Root owns adaptation/agents/public parents. Do not use an old facade's export-star to accidentally add new input/helper symbols to its old surface.

## Exact decisions and bytes to preserve

- Budget schema remains `automation-studio.exploration-budget.v1`. Defaults in field order: maxDurationMs=600000 (same canonical recovery constant), maxActions=24, maxProviderCalls=24, maxRefusedActions=2, maxRepeatsPerAction=2, maxStepsWithoutProgress=3, allowDestructive=false, frozen same_scope policy. Ceilings respectively 600000/64/64/8/4/8. Numeric resolver: undefined/nonfinite -> exact fallback; finite -> trunc then clamp between 1 and ceiling. No evidence-byte cap.
- Scope remains opaque `same_scope | allowlist`. Allowlist normalization filters strings with 1..2000 code units and retains the first 50, preserving duplicates/order/whitespace/case. No URL parsing or trimming. Unknown/missing resolver policy falls back to the original default. Allows uses exact includes or current===requested, rejects empty requested/current same-scope and an empty allowlist. Preserve this grammar rather than adding domain meaning.
- Deadline schema remains `automation-studio.recovery-deadline.v1`; default AND ceiling 600000. Finite duration trunc/clamps 1..600000; nonfinite -> default. Finite startedAt truncates, nonfinite ->0. Expiry is computed once; remaining=Math.max(0, expires-now); expired means remaining===0. Preserve insertion order and lack of further sanitization.
- Ledger retains its original budget object reference and original now callback. Its progress limit is captured at construction. Own expiry=startedAt+budget duration; recovery expiry=startedAt+remaining(recoveryDeadline, startedAt), which clamps an already expired recovery to the exploration start. Do not replace that formula by an uncapped historical timestamp. Min expiry wins; **tie chooses recovery_deadline_expired**. Nonfinite computed expiry retains existing Infinity/no-timer behavior.
- Admission precedence: already stopped/clock first; provider cap before increment; action cap before repeat check, then signature count and action increment. Refused admitted actions still count. recordAction increments observed count for each nonrefusal even if evidenceBytes=0; do not silently redefine this statistic. Refusal threshold stops with that refusal's own reason BEFORE progress evaluation; first stop reason wins.
- Progress values, in order: repeated_request, repeated_evidence, no_new_evidence, unusable_decision. Limit is finite-trunc/max1, otherwise default3. Record signature even on a barren action; refusal or nonpositive bytes is barren; remember digest only for nonbarren data. Decision order is repeated request, barren, repeated evidence. Productive step resets streak/reason. An unusable decision increments only the streak, without inserting a request/digest.
- Digest is original FNV-1a over **UTF-16 charCodeAt units**, unsigned Math.imul, lowercase unpadded hex, prefixed by canonicalText.length. That prefix is JavaScript code-unit length, despite the old comment calling it bytes. Do not switch to UTF-8, another hash or padded hex.
- Outcome order remains evidence_gathered, no_evidence_found, budget_exhausted, no_progress, unsafe_action_blocked, user_intervention_required, cancelled, failed. Completion returns gathered ONLY when observedActions>0 AND evidenceBytes>0 AND Object.keys(result).length>0. No provider/error/refusal/unknown path becomes absence or evidence success. These are evidence/progress data, never quiescence, unacted proof, completion capability or safe-retest credit.

Exhaustive stop table (10 keys): budget_exhausted <- wall_clock_expired, recovery_deadline_expired, action_limit, provider_call_limit; no_progress <- repeat_window, no_progress; unsafe_action_blocked <- destructive_action_refused, out_of_scope_refused, refusal_limit; user_intervention_required <- operator_approval_required.

Exhaustive loop table (12 full-code keys, all prefixed `llm_evidence_loop.`): failed <- invalid_configuration, invalid_decision, unknown_tool, duplicate_call, tool_failed, unreadable_replies, provider_unavailable; no_progress <- duplicate_tool_request, repeat_without_progress; budget_exhausted <- evidence_limit, iteration_limit; cancelled <- cancelled. Retain obsolete duplicate_call/duplicate_tool_request/evidence_limit union members AND map entries for stored compatibility.

Exhaustive budget table (6 full-code keys, prefixed `llm_budget.`): budget_exhausted <- run_call_limit, run_total_limit, run_output_limit, run_cost_limit; failed <- duplicate_request, invalid_reservation. Preserve Readonly<Record<full canonical union,...>> exhaustiveness, exact object key order and Object.freeze; no catch-all that silently maps unknown code to no evidence.

## Additive timer API and actual callers

Small proposed addition; preserve all existing constructor fields and callbacks:

```ts
type ExplorationBudgetLedgerInput = {
  budget: AutomationStudioExplorationBudget;
  startedAtMs: number;
  now?: AutomationStudioRunEnvironment["now"];
  startTimer?: AutomationStudioRunEnvironment["startTimer"];
  recoveryDeadline?: AutomationStudioRecoveryDeadline;
  externalSignal?: AbortSignal;
};
```

The environment type is imported from canonical runtime/environment, never a Studio facade. Its timer shape is `(wait:{readonly kind:string}, delayMs:number, fire:()=>void) => {cancel():void}`. This is an optional function port, not a new complete environment, execution envelope or receipt.

Precedence: explicit existing now remains the clock; absent -> original dynamic Date.now fallback. Supplied startTimer schedules the same remaining duration; absent -> native setTimeout with optional unref, retaining live behavior. Passing a custom now alone must NOT silently choose another timer. A caller supplying an environment should pass a matching clock/timer pair; bind methods to their ORIGINAL environment receiver if they need one, because a standalone function cannot recover its receiver. Retain/pin the original timer handle and cancel method/receiver.

Only production Ledger constructor is `recovery/runtime-exploration.ts:260`; its input already has now at :200, picks it at :255, uses it for start/duration, and forwards it unchanged. `recovery/annotation/exploration.ts:164` also already accepts now and forwards it at :267. Both lack startTimer. Exact required **outside-future-brief** slices for real forwarding: add optional timer to those two input types and pass it at those two call literals. Their remaining provider/permission/classification code stays untouched.

Full original-environment recovery wiring is another explicit slice, not implicit in the four-leaf move: `annotation/annotate.ts:167` currently creates the whole recovery deadline with Date.now; :457-484 calls recovery exploration without now/timer. To use a virtual environment there, start that deadline and forward clock/timer from the same actual graphOptions/environment pair. Do NOT reuse :394's summary.updatedAt-based now: it is metadata time and can be frozen. If this slice is not released, retain live annotation behavior and report that only direct callers can opt into virtual timers.

Original timer/abort lifecycle matters: constructor adds an anonymous once external-abort listener, aborts its own controller without copying the external reason, then arms even if already aborted. close only clears its native timer and is idempotent; it does not detach that listener. stop closes the timer, keeps the first reason, and aborts. Actual runner always calls close in finally (:392). Expiry before arm admission has no explicit DOMException; expiry callback uses the exact TimeoutError/message, so provider spending/cancellation distinctions stay unchanged.

**Approval facts before implementation:** named-listener cleanup on close, skipping/cancelling an already-aborted timer and cancellation on external abort improve lifecycle but change observable edge behavior versus the current code; do not silently fold them into a mechanical extraction. Preserve AbortError external cancellation versus TimeoutError expiry and first reason. A custom timer can fire synchronously or throw, and cancel can throw where native clearTimeout normally does not. Release the original handle at most once, clean up registration on constructor failure, do not swallow errors, and preserve a primary exploration failure if cleanup also fails (requires a narrow caller finally/error-handling slice). These exact lifecycle changes need Root's explicit acceptance/source slice; no source was changed here.

## Acceptance for the future unit

- Existing unchanged `recovery/tests/exploration-budget.test.ts`, `progress-guard.test.ts`, `exploration-outcome.test.ts`. Recovery-deadline assertions are embedded in exploration-budget at :284, not a separate current deadline test file.
- Preserve default/ceiling-loop equality, all stop priorities, four progress reasons and streak reset, exact map coverage including obsolete codes, and gathered/absence/budget/refusal/person distinctions.
- Add canonical constructor/function/constant-reference facade identity, schema/ordered JSON parity, Unicode/code-unit digest parity and canonical value+type closure with zero Studio edges. Do not merely compare aliases calling the same implementation for algorithm parity.
- Add timer-source tests using original runtime/environment virtual clock: expiry and recovery ties, no wall waits, native live fallback/unref, exact original cancellation receiver, idempotent close, close-before-fire, external abort, already aborted input, synchronous fire, scheduling/cancel failure. Separately pin current in-flight TimeoutError versus AbortError acceptance from runtime-exploration.test.ts:244.
- Actual adapter consumers are `runtime-exploration.ts` and `annotation/exploration.ts`; annotation starts the recovery. Keep their existing classification priority permission request -> person needed -> ledger reason -> external cancellation -> loop failure -> observed completion. The future four-leaf extraction does not own/rewrite that algorithm.
- Canonical environment tests `runtime/environment/tests/{virtual-timers,scoped-deadlines}.test.ts` establish existing clock/timer semantics. Strict/scoped structure/whitespace and focused source-closed consumer checks run only after implementation/source coordination. No test or probe was executed in this discovery.

Outcome: Done
Changed: this report only
Validation: read-only source/consumer/test inspection; tests/checks/builds not run
Not verified: future extraction, alias/byte parity and proposed clock/timer changes
Report: docs/working/runtime-ownership-refactor/reports/exploration-policy-plan.md
Notes: Thirty legacy exports mapped to single authorities. Actual diagnostic owner is canonical agents/ledger. Two additive timer-forwarding slices and explicit lifecycle compatibility decisions precede source release.
