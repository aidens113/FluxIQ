# C effective-input contract completion

Source status: FROZEN before this report. No checks/builds/audits/git/provider/browser calls run.
Feature: `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-reruns/`.

## Required private provenance

`AutomationStudioLlmRunNodesPriorCall` and `AutomationStudioLlmRunNodesOriginal` now both require `effectiveInputs: JsonObject`, separate from the existing resolved `input.parameters`.
The producer must explicitly attest the actual effective node-port inputs consumed by the admitted dispatch. An own field containing `{}` is valid evidence of no inputs; absent, undefined, null, array or non-JSON values refuse the original before any member dispatch. C never manufactures an empty map when the inputs are unknown.
The accepted original deep-clones and freezes `effectiveInputs`, including nested objects/arrays, without freezing or retaining references to producer-owned inputs.

`automationStudioLlmRunNodesEffectiveInput(original)` now returns internal `{node: definitionId, parameters: cloned actual parameters, effectiveInputs: cloned actual inputs}`.
This existing helper is used by the canonical list identity and current-versus-frozen per-member comparison, so equal parameters with different consumed inputs produce different keys, and changing a recorded input invalidates a pending member. Canonicalization still reuses the existing canonical JSON function and normalizes object-key order and node aliases.
The resulting private key contains `identity.input.calls[i].input.effectiveInputs`; no model call-id alias or model safety label substitutes for those inputs.

`runMember` signatures and the public tool declaration/schema are unchanged. The member callback receives frozen inputs through `request.original.effectiveInputs`; no inputs field was added to `request.value`, `core.run_node` arguments or model-facing `{calls}`.
`resolveAuthority(original)` receives the entire frozen record. D must refuse any consumed-input dependency not covered by trusted authority/effect contracts. The existing params-only effect resolver is sufficient only when its authoritative declaration genuinely depends on params alone.

## Privacy and D forwarding boundary

Coordinator requests, member `value`/`original`, identities, raw receipts/errors and returned control results are INTERNAL and may contain private resolved data.
D must retain the original public request for ordinary wrapper/trace JSON and transport frozen dispatch arguments plus effective inputs through an opaque private execution scope. It must never put raw selectors or these private values into a new model-facing decision JSON.
D publishes only a closed summary of requested/executed/skipped calls and the stopping index/code, plus ordinary already-screened individual member evidence. Never serialize the coordinator result, identity or originals wholesale.
Actual-dispatch capture remains mandatory after binding/retry/reacquisition; draft/ranWith/raw model JSON still cannot establish provenance. No loop/provenance/service/Down integration was changed here.

## Authored coverage and pending acceptance

Added specimens for equal params/different effective inputs producing distinct keys; nonempty effective inputs retaining alias/nested-key-order equivalence; missing and unreadable input provenance refusing before dispatch; deeply frozen clones surviving producer mutation; current-input changes stopping before the next member; and rejection of a model-supplied effectiveInputs field.
Existing ordered-call coverage now verifies frozen effective inputs; ordinary command-value shape remains unchanged.
Owning selector: `src/programs/automation-studio/runtime/llm/node-reruns/tests/run-nodes.test.ts`.
Lead acceptance: owning tests, affected package typecheck and structure audit after this source freeze. None were run by this worker.

Outcome: Done
Changed: `node-reruns/types.ts`, `prior-call.ts`, `identity.ts`, `tests/run-nodes.test.ts`, and this report
Validation: not run — brief reserves all checks/builds/audits to the lead
Not verified: current tests, typecheck, audit or D integration
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p9-append-only/c-input-contract.md`
Notes: Source frozen. Mandatory private effectiveInputs supersedes the earlier report's parameter-only snapshot/key shape; all other ports and public schema remain unchanged.
