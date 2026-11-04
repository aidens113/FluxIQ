# w1-output-binding

## Outcome
Done. Bug confirmed and fixed at the cause.

## Probe (before the fix, verbatim)
Part graph with nodes keyed s1, s2 and a declared output `answer` bound to `$node.s2.value`; replaced with `replaceAutomationStudioPartUnit` (two keyless steps); ran Call Subflow:
`PROBE succeeded succeeded {"answer":null} undefined` (run succeeded, call node succeeded, output null).
Control (unreplaced part): `{answer:"two"}`.
Node path, by reading code: `keptContract` kept only entry and checkpoint, so a replaced node lost `bootstrapSymbolicKey`; steps had no way to carry a key at all.

## Cause
Replacement steps are built with fresh ids and metadata `{runtimePatchRunId}` only. The key (`bootstrapSymbolicKey`) is how `$node.sN.x` bindings find a node, and nothing preserved or allowed it. `withDeclaredOutputs` then resolved nothing and the output came back null with the child "succeeded".

## What changed (packages/fluxiq/src)
- `runtime/llm/harness/structured-response.ts`: `AutomationStudioRuntimePatchStep.key?: string`. `provider-result.ts`: key allowed and checked with `isBoundedString`. `runtime-patch-schema.ts`: `key` in STEP_SCHEMA. `instruction.ts`: one generic sentence telling the repair to give a step the key when the contract's output is read by key.
- `runtime/adaptation/live-patch/unit-replace.ts`: `keptContract` keeps `bootstrapSymbolicKey`; a step's `key` is written as `metadata.bootstrapSymbolicKey` (node: first step overrides the kept key; part: any step). New refusal `step_key_in_use:<key>` for a key two steps share or a staying node already carries.
- `runtime/adaptation/live-patch/overlay.ts`: new optional input `subflowOutputs` (subflow id -> declared output ports). Part (and node replacement in a graph whose `metadata.parentSubflowId` is known) is refused with `part_output_binding_lost:<subflowId>:<portId>`, message names the port and key. Only refuses a loss the replacement introduced.
- `engine/automation/frames/lost-output-binding.ts` (new, exported from frames barrel): `automationStudioLostOutputBinding`. `call-subflow.ts`: a succeeded child (not a checkpoint hand-back) whose declared output names a key no node carries fails the call node with `executor.call_subflow.output_binding_lost`. A carried key whose node produced nothing stays null.
- Tests: new `runtime/adaptation/live-patch/tests/part-output-binding.test.ts` (probe turned into the frame failure, key on a step, node keeps key, key override and clash, overlay refusal/accept/node case/no-outputs, legit null); `frames/tests/call-subflow.test.ts` (new frame-failure test; the existing "never" output used key s9 that no node carries, which is exactly the now-failing case, so it now binds `$node.s1.nothing`); `llm/harness/tests/in-run-repair-patches.test.ts` (step key parsed, non-string refused).

## Commands and observed output
- `pnpm.cmd exec vitest run src/runtime/adaptation/live-patch/tests src/engine/automation/frames/tests/call-subflow.test.ts src/runtime/llm/harness/tests/in-run-repair-patches.test.ts src/runtime/llm/harness/tests/in-run-repair-slot.test.ts --minWorkers 1 --maxWorkers 2` -> Test Files 7 passed, Tests 77 passed.
- `pnpm.cmd --filter fluxiq check` -> tsc ran, no errors printed.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (490 warning(s), 1097 baselined)`.

## Not verified / needs the lead
- WIRING (not owned): `overlayAutomationStudioRuntimePatch` only refuses if callers pass `subflowOutputs`. Callers: `runtime/adaptation/live-patch.ts:370` (`prepareAutomationStudioInRunRepair`, needs an input passthrough), `framework/automation-service/service/runtime-session/in/run-repair.ts` (~312) and `service/adaptations/unit-repair-change.ts:73`. They must pass the part's `artifact.interface.outputs`. Until then the frame check (step 2d) is the only live guard.
- Not covered: a node another step reads as `$node.sN.x` is protected by the kept key but a step `key` rename that strands such a reader is not checked (only declared outputs are).
- The `contract` shown to the repair model (`context.inRunRepair.contract`) was not inspected to see whether it lists output bindings, so the new instruction sentence may reference data not yet shown.
- No browser, Lab or provider run; the branch "did not run" null case is approximated by a node that ran but produced no such output (a disconnected node fails the graph).
