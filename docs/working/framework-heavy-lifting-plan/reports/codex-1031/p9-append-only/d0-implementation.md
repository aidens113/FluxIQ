# D0 Core-private rerun provenance boundary

Source status: FROZEN before this report. No checks, builds, audits, git, provider, browser or panel operations run.
Owned source: `packages/fluxiq/src/programs/automation-studio/runtime/llm/rerun-provenance/` plus explicit adapter-only exports in `runtime/index.ts`; no loop, service, C or Down source edited.

## Stable API and export split

Private feature barrel exports `createAutomationStudioLlmRerunProvenance({currentScope})` returning `{capture, lookup, execute, dispose}`.
Factory, scope creation, record selection and sealing are NOT public runtime/SDK exports. `automation-studio/index.ts` already re-exports runtime, so no second change was needed.
Public runtime exports only `automationStudioLlmRerunCapture`, `automationStudioLlmRerunExecution` and their adapter-facing types.

```ts
type Scope = {loop:object; binding:object; generation:object; registry:object; authority:object};
type Request = Parameters<AutomationStudioLlmEvidenceLoopInput["executeTool"]>[0];
type Executor = AutomationStudioLlmEvidenceLoopInput["executeTool"];
type Attempt = {identity:object; receipt?:object; outcome:"succeeded"|"failed_unacted"|"uncertain"|"unknown"};
type Snapshot = {
  owner:object; generation:object; definitionId:string; definitionVersion:string;
  parameters:JsonObject; effectiveInputs:JsonObject; adapterValue:JsonObject; referenceNow:number;
  subject:object; capsule:object; dispatch:{attempts:readonly Attempt[]; selected:object};
};
capture(request:Request, wrappedExecuteTool:Executor): Promise<Result>;
lookup(callId:string): {kind:"available";record:Record} | {kind:"unavailable";reason:ClosedReason};
execute(record:Record, request:{callId:string;signal?:AbortSignal}): Promise<
  {kind:"returned";result:Result} | {kind:"unproven";reason:ClosedReason;result:Result}
  | {kind:"unavailable";reason:ClosedReason}>;
automationStudioLlmRerunCapture(): {kind:"capture";publish(snapshot:Snapshot):Accepted|Unavailable}|Unavailable;
automationStudioLlmRerunExecution({owner,generation,value}):
  {kind:"ordinary"} | {kind:"refused";reason:ClosedReason}
  | {kind:"selected";capsule:object;consume(capsule:object):Consumed|Refused};
```

Exact prefixed types and closed reasons are in `rerun-provenance/types.ts`; private `Record` exposes callId/toolId, canonical definition id/version, actual parameters/effectiveInputs, referenceNow/resultCode, originalValue and immutable actual outer execution.
All record fields, lookup.record, selected.capsule and outcome.result are nonenumerable; JSON/string spreads publish only closed control discriminants/reasons. Original errors propagate unchanged through the private ordinary execution path and are never put in an outward summary.

## Implemented boundary

Registered-symbol process-global ALS shares only ambient capability closures across bundled/dynamic Core copies; registries/transactions/executor references remain closure-owned. Actual loop/binding/generation/registry/authority objects are compared by identity, never reconstructed from JSON.
Adapter publication is provisional and one-use. Existing C/canonical JSON, freeze and execution-receipt readers are reused; metadata is descriptor-checked, structured-cloned and deeply frozen without freezing producer-owned identities.
Own effectiveInputs is mandatory: explicit `{}` works; absent, undefined, null, array, accessor or non-JSON values remain unproven. Logical parameters, actual adapter input and opaque lowered execution capsule stay separate.
Dispatch proof requires unique actual attempt identities, selected equal to the final attempt, explicit succeeded outcome and a receipt object. Unknown/uncertain attempts, selected failed attempts, missing receipts or mismatched selection cannot seal despite successful outer JSON.
Only the original OUTERMOST wrapped return seals: actual execution envelope, explicit positive ok, valid receipt controls, no failure/person-needed/written/synthetic verify/present/refusal override. Capture alone, raw ranWith and copied JSON never select records.
Execute selects by private record identity/current scope and invokes the SAME stored wrapped executor with a fresh real callId, cloned original OUTER public value and captured referenceNow. It transports no resolved actual parameters/capsule through decision/history JSON.
Adapter matching uses owner/generation identities and canonical captured adapterValue after outer transforms; Core's real call id stays ambient. Active mismatch returns refused and revokes proof; it never returns ordinary. Exact capsule acknowledgement is one-use and required; unconsumed/copied/stale consumption returns unproven while retaining any actual returned result for ordinary accounting.
Dispose/replaced scopes/reused call ids/foreign records/old clients cannot revive authority. New frozen member call ids are deliberately not freshly sealed from capsule consumption alone; only a new ordinary captured call proves new authority.

## D1 obligations

Read execution accessor BEFORE any old model-handle resolution; ordinary continues, refused returns controlled refusal, selected requires exact own WeakMap membership before consume(capsule). Never fall back after active refusal.
Maintain private stable owner/generation objects. Deep-freeze/copy capsule payload, explicit effective browser/session/frame scope, fixed reference instant and semantic subject/source proof in the adapter's own registry; link capsule exactly to dispatch.selected.
Accumulate authoritative normal/fresh attempts and publish ONCE after final actual dispatch/lowering, with actual adapterValue and own explicit effectiveInputs. Never derive provenance from draft/ranWith or inferred field names. Unaccounted defaults/changed or ambiguous subjects stay unproven.
Frozen execution must share ordinary permissions/origin/actionability/retry/receipt/purse/uncertainty/postprocessing paths; this module dispatches and authorizes nothing.

## D2 obligations and pending acceptance

Wrap outside all result-replacing wrappers; provide actual private loop/binding/generation/registry/authority identities. Rotate registry identity for canonical version/definition changes and authority identity for grant changes; never recreate them per lookup or reuse old generations.
Map only available sealed records to C, including actual parameters, effectiveInputs and immutable actual execution; resolve current trusted canonical effects/version/authority before every member. Keep ordinary admission/accounting/history/summary/privacy/uncertainty guards and dispose with the loop.
Handle execute unavailable as unrun and unproven as an actual returned receipt lacking frozen authority, preserving its ordinary accounting and stopping later members. Returned means capsule consumed, not successful execution; ordinary settlement still judges result.
Authored tests cover forged JSON/capture-only/outer refusal/errors/written/verify/person-needed, dispatch outcome/linkage, effectiveInputs/immutability, input transformation/mismatch, owner/generation/capsule consumption, scope/version revocation, nested/parallel/cross-copy, old clients/dispose/restart, original executor/input forwarding and closed summaries.
Lead selector: `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/llm/rerun-provenance/tests/provenance.test.ts`; affected package types and narrow structure gate remain lead-owned after all writers freeze.

Outcome: Done
Changed: new rerun-provenance feature/owning tests; runtime adapter-only exports; this report
Validation: not run — brief reserves checks/builds/audits to the lead after source freeze
Not verified: compilation, authored tests, audit, D1/D2 wiring, provider-free paired browser behavior or live behavior
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/d0-implementation.md`
Notes: Source frozen. No dispatch/retries/effect grants or public authority factory added. Exact adapter matching preserves original outer public input.
