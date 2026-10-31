# P9 C implementation — safe prior-call primitive

Source status: FROZEN before this report; no checks/builds/audits/git/providers/browser operations run.
Owned source: `runtime/llm/node-tools/run-nodes/{types,tool,prior-call,result,identity,execute,index}.ts`, owning `run-nodes/tests/run-nodes.test.ts`, and `node-tools/index.ts`.
All paths below are under `packages/fluxiq/src/programs/automation-studio/`.

## Exact entry points and private contracts

`AUTOMATION_STUDIO_LLM_RUN_NODES_TOOL_ID = "core.run_nodes"` and `automationStudioLlmRunNodesTool()` only declare the tool; no offering/binding/live loop changed.
`runAutomationStudioLlmPriorNodes(input: AutomationStudioLlmRunNodesInput): Promise<AutomationStudioLlmRunNodesResult>` coordinates the list.
Input: `{loopId: string, value: unknown, world: JsonObject, ports: AutomationStudioLlmRunNodesPorts, signal?: AbortSignal}`.
Model value must be exactly `{calls: string[]}`: nonempty, unique, ordered, nonblank ids; no extra properties.

```ts
type PriorCall = {
  callId: string; loopId: string; toolId: "core.run_node";
  definitionId: string; definitionVersion: string; input: JsonObject;
  execution: unknown; authorityKey: string;
  actionEffect: AutomationStudioResolvedActionEffect;
  observedEffect?: AutomationStudioResolvedActionEffect;
};
type Original = Readonly<{
  callId: string; loopId: string; definitionId: string; definitionVersion: string;
  input: JsonObject & {node: string; parameters: JsonObject; consequences: []};
  authorityKey: string; resultCode: string | undefined;
  actionEffect: AutomationStudioResolvedActionEffect; observedEffect?: AutomationStudioResolvedActionEffect;
}>;
type Authority = {definitionId: string; definitionVersion: string; authorityKey: string; observedEffect?: AutomationStudioResolvedActionEffect};
type Identity = Readonly<{input: JsonObject; key: string}>;
```

These names carry the `AutomationStudioLlmRunNodes` prefix in `types.ts` (`PriorCall`, `Original`, `Authority`, `Identity`, `ConcreteInput`, `Allowance`, `StopReason`, `MemberReceipt`, `Result`, `Ports`, `Input`).
Ports: `lookupPriorCall(callId): PriorCall | undefined`; `resolveAuthority(original): Authority | undefined | Promise<...>`; optional `resolveRerunEffect(definitionId, concreteParameters): AutomationStudioResolvedActionEffect | undefined | Promise<...>`.
`runMember({index, original, value, signal?}): Promise<{callId: string; result: unknown}>` is the injected ordinary fully wrapped/accounted member path.
`allowance(): {allowed:true} | {allowed:false; reason:"cancelled"|"tool_calls"|"time"|"purse"|"unavailable"} | Promise<...>`.
`listGuard.admit(identity): boolean | Promise<boolean>` and `listGuard.recorded(identity, result): void | Promise<void>`.

Return shape: `{kind:"completed"|"rejected"|"stopped", requested: readonly string[], executed: readonly MemberReceipt[], skipped: readonly string[], stop?:{index:number, priorCallId?:string, reason:StopReason}, identity?:Identity, listRecord?:"recorded"|"failed"}`.
`MemberReceipt` is `{index, priorCallId, kind:"returned", callId, result:unknown}` or `{index, priorCallId, kind:"threw", error:unknown}`; errors never become invented execution receipts.
Stop indexes are zero-based; guard-record failure after a complete list uses `requested.length` with no priorCallId. A record failure changes completion to stopped, preserves any prior stop and all receipts, and sets `listRecord:"failed"`.
No aggregate `evidence`, `effectApplied`, success receipt or judged-Flow result is manufactured.

## Implemented safety and identity

All originals and fresh authority/effects are validated for the whole list before dispatch, then re-read before every member; authority lookup, version, effective arguments, baseline code and registry/grant epoch must still match.
Original success requires the existing execution reader, an actual execution envelope, explicit `evidence.ok === true`, and no failure/person-needed/written result; malformed failure metadata refuses rather than disappearing into a false success.
Result codes compare exactly, including present-versus-absent. An explicitly absent original code may match an absent actual code only with a positive actual success receipt.
The existing resolved-effect reader enforces shape and floors: only observe/no consequences or state/explicit trusted repeatSafe/no consequences; commit, unknown, malformed, unresolved conditional, observed lasting and unknown effects refuse.
Snapshot input is deeply frozen; actual parameters are preserved and node aliases normalize to stable definitionId for dispatch. No write/replay/item/output binding keys or unresolved parameter bindings qualify.
List identity uses the existing canonical JSON function over ordered stable definitionId/version + actual concrete parameters + stable authorityKey and one captured world object; call ids, aliases, generated execution ids and model label/control additions do not define it.
One list guard check precedes dispatch and one record follows every admitted completion/stop, with the original captured identity despite members moving world/epochs. Prevalidation/admission refusals do not record an executed list.
Members run sequentially with ordinary allowance/cancel checks immediately before dispatch; the first failure/code change/uncertainty/throw/lost eligibility stops the list and preserves the stopping actual receipt. No retries, caps, provider, purse, reset or draft additions were introduced.

## Remaining D obligations

Capture private actual-dispatch provenance after binding/retry/reacquisition (including referenceNow changes); NEVER populate lookup inputs from draft/ranWith or raw model JSON, which can restore model-facing extraction handles. No JSON token/flag establishes this authority.
Resolve the canonical execution node and canonical policy output's trusted floor through the existing native runtime resolver; supply stable library definition versions and registry/grant authority epochs, never generated graph/call ids or per-call nonce authority.
Rerun the frozen private dispatch arguments through the existing fully wrapped execution/admission/permission/person-needed/retry/uncertainty/required-receipt path, not native.execute/direct dispatch; allocate unique real call ids and account each actual member once under the same purse.
Keep each member's ordinary repeat guards/evidence/history/routing/privacy/control handling. Guard list identity once using the captured pre-list context, and record its result exactly once with that same identity; no synthetic envelope counts as another executed action.
Do not serialize private identity/originals/raw errors or this control result as model evidence. Build a screened summary and keep all actual member receipts in the ordinary evidence path. End safely on `listRecord:"failed"`.
Offer only when private originals plus trusted resolution are available; no automatic draft additions, rebinding, reset, model calls or whole-Flow-success settlement. C does not wire any live loop.
Lead must run the owning test file, affected types and structure audit after all writers freeze. Tests authored cover aliases/key order, complete rejection, first/middle/last stops, code presence/change, malformed/failed/uncertain/person-needed/throw receipts, trusted floors/conditional commits/escalation, authority/provenance changes, cancellation/limits, frozen actual inputs and list-guard capture/record failures.

Outcome: Done
Changed: C-owned primitive/barrel/tests and this report only
Validation: not run — worker brief reserves all checks/builds/audits to the lead after source freeze
Not verified: compilation, tests, structure audit, D loop integration, live browser behavior or savings
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/c-implementation.md`
Notes: Pure injected primitive only; actual-dispatch provenance and ordinary guarded/accounted rerun remain D's required integration boundary.
