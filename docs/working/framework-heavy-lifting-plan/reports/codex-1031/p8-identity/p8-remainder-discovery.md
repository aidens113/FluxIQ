# P8 Runtime Guard and Recovery History — Remainder Discovery

## Findings

### Runtime repeat guard

- executor/graph-run.ts is the execution owner. It initializes one mutable AutomationStudioStepLoopContext, then runs the Flow in its bounded for loop. step-loop/arrival.ts handles each arrival; after dispatch, the loop stamps retry, reacquire, pace, readiness, and routing onto the attempt before automationStudioRepeatNoProgress is consulted and before the attempt is appended.
- An existing guard is narrowly for do-while Repeat nodes: executor/repeat-progress/no-progress.ts, called at graph-run.ts after an attempt is made and before a new pass starts. It checks loop progress, permits page change as progress, and ends after its own no-progress limit. This does not compare arbitrary repeated node executions by target, inputs, and view digest.
- The loop also has independent protections: ctx.maxSteps bounds total execution; the state-route guard tracks repeated routing; retries follow the attempt ladder. These are not the required unchanged-repeat guard. I found no general run guard keyed by (node, target, inputs, view digest) and no step-loop/tests/run-repeat-guard.test.ts.
- Smallest likely runtime unit: a focused guard helper under executor/step-loop/ plus its barrel and owning test, with one call in executor/graph-run.ts at the attempt boundary. Exact target and view-digest producers/identity representation remain for the other identity discovery reports; do not invent a source-less identity here.
- Regression boundaries: terminate after two identical unchanged repeats; do not terminate on changed node/target/inputs/view digest; preserve legitimate For Each / different-row iterations; clear or distinguish resumed retry attempts so a retry is not counted as a fresh stuck repeat; exercise an ordinary different-node cycle separately. Ensure a lasting act with ambiguous/unknown outcome still stops through the existing uncertain-outcome path, and permission refusals stay protected.

### In-run repair history

- Call path: executor/step-loop/incident-repair.ts invokes the runtime repair callback with the incident, failed attempt, and run attempts; service/runtime-session/in-run-repair.ts calls automationStudioInRunRepairSlot; recovery/in-run-repair/slot.ts combines the unit and contract with automationStudioInRunRepairHistory from recovery/in-run-repair/history.ts; recovery/annotation/annotate.ts places this in the patch request's typed inRunRepair context. llm/harness/context-packet.ts bounds/screen-packs that context before the model request.
- Existing history is derived from recorded incident/attempt fields, not model prose: incident ids/routes/handlers/alternatives, a compact failed-attempt shape, retries, handlers, state-route outcome/destination/refused guard names, ladder choice, repair outcome/unit, counted failures, and completed-act ids. Attempt inputs/outputs are deliberately not read. Current types are in llm/harness/task-request.ts.
- Runtime attempts already carry structured reacquire, pace, stateRouting, and failure/obstruction evidence (executor/contracts.ts); history currently does not include reacquisition or pace records, does not expose obstruction observations, and captures state-route history only when stateRouting is present. The run also has lifecycle/recovery evidence in other attempt fields. This is an omission in the mapper/context contract, not a need to invent observations.
- Smallest likely history unit: extend history.ts to map bounded, typed summaries from the existing attempt fields and extend AutomationStudioLlmInRunRepairRecovery in llm/harness/task-request.ts to represent them; keep them in recoveriesTried so the existing packet bounding applies. The internal LLM request shape changes, not a public package seam. No new safety proof should be synthesized: include only what the executor recorded, and never raw inputs, outputs, page text, target handles, or obstruction payloads.
- Existing focused tests: recovery/in-run-repair/tests/request-slot.test.ts asserts the composed slot; llm/harness/tests/in-run-repair-slot.test.ts checks packing, bounding, withheld values, and secret screening. A named history-record.test.ts from the plan is absent. Add mapper coverage for obstruction kind/code only, pace fields, re-acquisition outcome/source identity without stale handles, and state-route observations; verify no raw page/value data crosses the slot/packet. Preserve existing tests that completed acts and uncertain outcomes are not misrepresented as safe to repeat.

## Suggested next unit boundary

One P8 runtime unit can own executor/step-loop/ plus executor/graph-run.ts for the generic guard, and recovery/in-run-repair/history.ts, recovery/in-run-repair/tests/, and llm/harness/task-request.ts for history shape. llm/harness/tests/in-run-repair-slot.test.ts is also an owning test if the added fields need packet/screening assertions. The boundary depends on the other discovery reports settling the target/view digest interface; history can be implemented against the existing attempt record.

Outcome: Done
Changed: report only
Validation: not run (discovery)
Not verified: runtime behavior, types, browser
Report: C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/p8-remainder-discovery.md
Notes: No source, checks, agents, git, browser, provider, or runtime state touched.
