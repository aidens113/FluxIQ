# D3 trusted settled safety design (read-only source investigation)

Source prefixes: `R=packages/fluxiq/src/programs/automation-studio/runtime/`; `N=packages/fluxiq/src/programs/automation-studio/nodes/`; Down paths are in paired `!FluxIQWebExtension`.
Only this report was written. No implementation, checks, builds, browser, provider or git operations ran.

## Confirmed ownership and loss

- `R/action-permissions/gate.ts:303` `checkFor(action)` parses the actual Domain declaration, then `automationStudioActionPermissionProjection(read)` at311 supplies the effective legacy effect and consequence union. `read.actionEffect` retains the full trusted resolved class/repeat proof.
- Its local `record(verdict)` at313 is the correct settlement hook, BEFORE the `records.length < AUTOMATION_STUDIO_ACTION_DECLARATIONS_MAX` branch. `declared.ts:23` caps history at500; scanning declarations is unsound.
- History stores only `action.effect` (`observe|mutate`), consequences and permitted. It discards `actionEffect.effectClass` and `repeatSafe`; a trusted `commit/[]` becomes `mutate/[]` and cannot be reconstructed.
- `gate.ts:446` `automationStudioActionPermissionDenied` is a second actual assessment entry; it uses the same parser/projection but has no action ref. Instrument it too, as unbound/auxiliary evidence.
- `R/flow-bootstrap/action-permissions.ts:324` obtains the gate check with trusted `{kind,id,ref}` from the outer call. `asking()` may invoke it twice around an ask. Baseline/undo preconditions can refuse BEFORE the gate at369,417,432; outer replacements at385,443,456 still belong to final settlement.
- `R/llm/rerun-provenance/provenance.ts:156` surrounds the whole wrapped executor; only its final outer result at165 currently establishes positive receipt settlement. Its private record at172 has no observed safety field.
- `R/llm/prior-nodes/controller.ts` initially synthesizes an empty declaration and omits C's optional observedEffect. D2 is independently correcting declarations/control eligibility; this report does not verify its changing source.

## Private interface proposed for root to freeze

Own the neutral transport under NEW `R/action-permissions/assessment-observation/` (types/context/observation/index); no dependency on llm, provenance, bootstrap or service. Gate and D0 import this local feature barrel. Do NOT export it from `action-permissions/index.ts`, runtime or SDK barrels.

```ts
type Source = Readonly<{ kind: "exploration_step" | "flow_step"; id: string; ref: string }>;
type Settled = Readonly<{ effect: AutomationStudioResolvedActionEffect; permitted: boolean }>;
type Event = Readonly<{ kind: "started"; identity: object; source?: Source }>
  | Readonly<{ kind: "settled"; identity: object; value: Settled }>;
type Scope = Readonly<{ observe(event: Event): void; veto?(input: Readonly<{ source?: Source; effect: AutomationStudioResolvedActionEffect }>): boolean }>;
runWithAutomationStudioActionAssessments<T>(scope: Scope, run: () => T): T;
beginAutomationStudioActionAssessment(source?: Source): Readonly<{
  veto(effect: AutomationStudioResolvedActionEffect): boolean;
  settle(value: Settled): void;
}>;
```

Names/types above are a proposal, NOT existing exports. This is observation plus a DENY-ONLY preflight; no executor, permission grant/bypass, model flag or producer-supplied JSON authority. A missing veto callback means ordinary permission handling proceeds; true from ANY active scope vetoes, and a thrown/unreadable callback fails closed.

1. `checkFor` starts an assessment BEFORE parsing. Copy only trusted action kind/id/ref; no control name/target/parameters enter events. AFTER parser+projection/full-floor normalization and BEFORE the empty-consequences early return, `instructedFor()`, decline lookup or request generation, call ticket.veto(fullFloor). On true return `record({permitted:false,missing:[],requestId:null})` immediately. In `record(verdict)`, ticket.settle with full floor and verdict BEFORE capped history. `automationStudioActionPermissionDenied` uses identical ordering, without a Source.
2. Starting before parsing makes thrown/unreadable/unfinished assessments remain pending, so a wrapper swallowing an error cannot leave only a later safe event. Duplicate finalization, malformed events and pending completion at outer return are unproven. A denied assessment stays conservatively unproven even if a subsequent ask grants another assessment.
3. Use a registered-symbol process-global AsyncLocalStorage, following `R/llm/harness-options/evidence-build-scope.ts:63` and D0 context's cross-copy precedent. Keep sinks/tokens/aggregation closure-owned. The neutral context is an immutable linked stack: nested scopes notify their own and every active ancestor sink; concurrent promise chains stay isolated.
4. D0 opens/closes this observation scope around the SAME outer executor invocation it already captures. Existing D0 unavailable/nested frames must not hide ancestor safety sinks or veto callbacks. All actual gate assessments from retries, reacquisition, auxiliary reads and nested calls aggregate; never choose only the last one. Capture scopes omit veto; execution scopes install it.

## Exact effective-floor rule

Use the gate's normalized `read` and existing projection `p`; never normalize from a history entry or returned JSON. Build one resolved assessment floor:

- `permissionConsequences = p.consequences` (the ordered effective union; truthful observation's disregarded model classes remain disregarded).
- Class is `commit` when that union is nonempty OR `read.actionEffect.effectClass === "commit"`; otherwise `state` when the trusted floor is state OR `p.effect === "mutate"`; otherwise `observe`.
- Preserve `repeatSafe:true` only for an effective state with explicit trusted state-floor `repeatSafe:true` and no consequences. A legacy mutate/[] without that proof is unsafe state. An observe floor paired with legacy mutate cannot supply state repeat safety.
- Aggregate ALL assessment floors with `N/action-effect/combine.ts`; it preserves commit dominance, consequence union and refuses state repeat safety when any state floor lacks its proof. Use `read-resolved.ts` to validate/copy; deep-freeze owned results, never producer objects.

## D0/D2 contract and identity

- Add PRIVATE optional `AutomationStudioLlmRerunRecord.observedEffect?: AutomationStudioResolvedActionEffect`; store it nonenumerably with the existing hidden fields. Do not add it to public CaptureSnapshot or let a producer publish it.
- A positive observedEffect requires at least one completed permitted PRIMARY `exploration_step` with `source.id === request.toolId` and `source.ref === request.callId`, no pending/invalid/denied assessments, plus all existing actual-dispatch and outer-receipt checks. Auxiliary safe reads alone never prove an unchecked main action.
- No assessment/primary assessment means observedEffect ABSENT, never observe/[] by default. Existing receipt provenance may remain available without safety proof; D2 MUST reject absent observedEffect before offering/remembering/dispatching a batch candidate. Denied/invalid/pending assessment or outer failed/refused/unknown settlement must not create an eligible record.
- D2 forwards the actual private observedEffect into C's prior call, preserves it in current authority checks and applies C's existing effect-safe predicate to BOTH canonical and observed floors. Actual commit/[] or any effective consequence rejects even when the current registry says observe/[]. Do not overwrite actual observation with a fresh registry result.
- During D0.execute, its active private scope supplies a veto callback BEFORE invoking the stored executor. Revalidate original/current authority and reject malformed/unreadable assessments, unsafe effective floors, changed/missing trusted primary ownership, or a stronger actual effect than the accepted original observed envelope; use C's existing safe predicate and the same effective-floor order, not model metadata. All auxiliary/nested actual floors are checked too. Permit is still decided only by the ordinary gate.
- Accepted observed envelope bounds classes by observe<state<commit and consequences by subset; state requires the same explicit repeatSafe proof. A newly state effect against an originally observe-only envelope is stronger and vetoed even if itself repeat-safe. Absent/invalid source never supplies PRIMARY proof; unbound safe auxiliary assessments can only contribute conservatively to an already owned call.
- `asking()` at328 cannot ask/grant this veto: false/null has no matching gate.request requestId, so it returns immediately; the veto occurs before any new gate request exists. A normalized unknown/unsafe floor is held BEFORE permission returns/dispatch, not merely rejected after its receipt.
- D0.execute should return unproven on veto/lost proof while preserving any actual outer result. D2 stops later members and performs ordinary settlement/accounting on returned receipts; a hidden outcome observedEffect may support that check but cannot replace predispatch veto.
- At D0.execute's EXISTING selected.consume closure (`provenance.ts:238`), require a matching fresh-call PRIMARY assessment already settled permitted, no pending/invalid/vetoed assessments, and a safe aggregate within the accepted envelope BEFORE consuming. Otherwise return a closed refused reason (e.g. new `assessment_unproven`) and never fall back. This holds missing-primary/no-check replay before its main dispatch; later auxiliary assessments still undergo deny-only preflight.
- Correlation uses scope object identity + trusted outer action ref, not model call JSON; retain existing D0 loop/binding/generation/registry/authority checks and transaction closure. Source currently has no token link from gate assessment to `dispatch.selected`; the proposed primary ref proves wrapper ownership, not an independently attested dispatch-assessment pair.

## Old clients and paths with no actual check

- No public adapter change is required. An older Core copy lacking the hook yields no primary observation and no batch eligibility; successful ordinary calls keep their ordinary behavior.
- Down `domain/src/runtime/llm-evidence/permission.ts` returns before `input.check` for declared undefined and observe/null. `node-run/run.ts:235` main observation branch bypasses webActionPermission entirely; other nodes call it at377 with trusted `webAutomationResolvedActionEffect(node.actionType,written)`.
- Core `R/native-node-runtime.ts:115` computes a canonical actionEffect, then raises host.sideEffectClass; it does NOT perform this action-permission assessment. Registry lookup/host flags alone must not fabricate actual observation for direct native/no-check reads. Such paths remain ineligible until the actual owning path supplies a genuine main assessment.
- A future change to make no-check paths eligible must instrument their trusted actual assessment, with explicit primary correlation; it is outside this narrow capture/preflight design. Missing observations inside an uninstrumented trusted implementation cannot be detected by watching unrelated gate events; consume must therefore require positive primary proof.

Receipt/consumption limit: Down frozen non-observation path checks permission at `node-run/run.ts:377` BEFORE `frozen.consume()` at425 and main retry dispatch at433, so this actual path can refuse main dispatch unacted. Consuming a capsule only acknowledges private selection; it proves neither dispatch nor a receipt. Do not assert globally that veto means zero prior auxiliary commands, or that consumed means an action ran. A producer consuming/acting before its check cannot be made safe by passive post-settlement capture; keep it ineligible. Existing D0 unconsumed/unproven handling retains an actual refused result instead of falling back or discarding it.

## Minimal implementation partition and acceptance

1. Neutral feature + `action-permissions/gate.ts` + owning tests: normalized full floor, started/finalized events, both gate entries, no public exports or high-level imports.
2. D0 types/provenance + owning tests: scoped aggregation/primary proof, private optional field/outcome, closure/nesting/concurrency/cross-copy privacy. D0 remains owner of outer settlement; C remains owner of repeat-safety policy.
3. D2 controller/member + owning actual-loop tests: missing proof rejects, actual observation forwarded, commit-floor mismatch refuses, member receipts retained on lost proof. Serial integration after root freezes the neutral types.
4. Required cases: safe primary observe and explicit repeat-safe state; legacy mutate/[] unsafe; commit/[] over safe registry; effective client/model consequence union; truthful observation disregards classes; >500 records; first commit then safe observation; declined-then-granted; malformed/thrown/pending check swallowed by successful wrapper; safe auxiliary with unchecked main; concurrent/nested/cross-copy scopes; outer refusal/unknown; late finalizer; absent old-client proof; private JSON/spread empty. Execute cases must prove changed commit/[], changed repeat safety/unknown floor and nested auxiliary commit are vetoed BEFORE dispatch and BEFORE an ask, with ordinary unpermitted/no-request result; already returned auxiliary/member receipts survive a later veto.

Outcome: Done
Changed: this report only
Validation: not run — brief forbids checks/builds; source inspection only
Not verified: implementation, compilation, tests, audit, D2 corrections or runtime behavior
Report: docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d3-safety-design.md
Notes: Root must freeze interface before implementation. No new authority is inferred from model JSON or canonical registry observations.
