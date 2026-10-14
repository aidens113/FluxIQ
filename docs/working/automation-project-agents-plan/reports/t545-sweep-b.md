# t545-sweep-b: sweep Group B (recordings and proposals)

## Outcome

Done. All 15 Group B files pass: "Test Files 15 passed (15)", "Tests 123 passed (123)". Before the fix it was 118 failed and 16 passed. No product file changed and no gate was relaxed.

There were 118 failing tests, from three causes:
- **99 stale fixtures.** I fixed them with recording descriptions, one Flow instruction, and process-boundary time limits.
- **19 tests of the approval t519 removed.** The supervisor ruled that recording-to-executable approval was retired on purpose. Following that ruling, I deleted 11 of them. I cut the other 8 back to their proposal half: proposal generation is still a live product path, and each of those tests' titles is about proposal behaviour.

The total fell from 134 to 123, which matches the 11 deletions.

## What changed and why

Every edit is in a `tests/` directory. The description and instruction text is generic and not shaped like any scenario.

### Stale fixtures (99 tests)

- **Recording descriptions (94 refusals of "Describe what this recording demonstrates").** I added `description: "Shows the steps the automation repeats."` to every `service.createRecording({...})` call in the group's files. I made the same change in the two child-process probes, `service/recordings/tests/process-probe.mjs` and `public-writer-process-probe.mjs`; only `process-restart.test.ts` uses them. In multi-line calls the key sits on the `createRecording({` line, so line counts are unchanged.
- **Flow instruction (1 refusal of "Write active instructions").** In `runtime/tests/importer-record-capture.test.ts`, `extractionFlow` now calls `service.saveFlowGenerationInstruction({ projectId, flowId, instruction: "Read every item of the list." })`, as t543 did.
- **Time limits in `process-restart.test.ts` (accepted by the supervisor).** Each test runs two child processes that load the built `dist`. At idle the pair took 7.9 s + 3.4 s and produced correct output, against a 15 s test limit and a 15 s limit per child. Under parallel load the tests timed out, or a child was killed at its own limit. Each test now has `{ timeout: 60_000 }` and each child `{ timeout: 45_000 }`.

### Retired approval (19 tests): 11 deleted

These tests were about what happens after a recording proposal is approved. That path no longer exists.

| File | Deleted test | What it covered |
| --- | --- | --- |
| service/recordings/tests/candidate-definitions | "is one definition per candidate, naming its output, payload, and confirmation" | An approved proposal into `kind: "node"` writes one node definition per candidate (output, payload, confirmation, recorded gap). |
| same | "carries the visibility the review chose" | The approved definitions carry the review's private or public visibility. |
| same | "runs as that definition's output action, with its payload and confirmation, while any other node runs as authored" | A Flow node naming an approved recording definition runs as that definition's output action. |
| same | "carries the record output and timeout into the definition, and a node naming it runs as an action whose rows reach the record hook without the excluded field" | An approved extraction definition carries the record output and timeout, and its run saves records. |
| same | "are offered by the same records port, and edited by the same control, as the policy action the node becomes" | The records port and editing control of a node built from an approved definition. |
| same | "feed a For Each over the recorded node's records port, which runs its body once for each extracted row" | A For Each over an approved recorded node's records. |
| service/recordings/tests/proposal-candidates | "is written, with the timeout, into the approved node, whose run hands the record hook its rows without the excluded field" | A candidate's record output reaches the approved Flow node and its run. |
| same | "is the first candidate's node, though the graph index lists a later candidate's node first" | An approved recording Flow starts at the first candidate's node. |
| service-recordings/tests/proposal-approval | "approves edited recording Flow proposal graphs into Flows" | Approving and re-applying an edited recording Flow proposal into a Flow. |
| service-recordings/tests/task-proposals | "merges proposals from multiple recordings into one canonical Flow" | `approvePolicyProposal` merges two recordings' policy proposals into one Flow with a recorded branch. |
| same | "applies edited proposal overrides exactly instead of preserving deleted nodes" | `approvePolicyProposal` with `policyOverride` replaces the Flow's nodes exactly. |

### Retired approval (19 tests): 8 trimmed

In each of these I kept the part that checks proposal behaviour and removed only the approval half.

| File | Test now | What was removed |
| --- | --- | --- |
| proposal-candidates | "is held by the candidate as a clone of what the mapper proposed" (was "reaches the approved node's parameterValues as a clone…") | The approved node's `expectedState`. |
| same | "is dropped, and the action still proposed, when it is not a plain object" | The approved-graph checks in the `expectEveryExpectedStateDropped` helper. |
| same | "is dropped, and the action still proposed, when it has no keys" | The same helper change. |
| same | "is not proposed when the candidate gives none" (was "…and the approved node carries none, when…") | The approved node's parameterValues. |
| same | "is not proposed when the candidate gives null" | The same. |
| service-recordings/tests/proposal-approval | "persists recording pipeline artifacts through a policy proposal and removes them with the recording" (was "…through proposal approval and replay") | `approvePolicyProposal`, the replay, the approved-Flow and graph checks, and the `policies/` file check. The policy proposal's status is now expected to be `"proposed"`. Normalization, mining, the learned model, the pipeline files and their cleanup on delete are all still checked. |
| service-recordings/tests/proposals | "turns mapped observations into proposal candidates without making action inputs policy state, and invalidates them when the confirmation input goes away" | All `reviewRecordingFlowProposal` approvals: routing, replacement, the edit-safety refusal, the run, and the mapper-version invalidation that needed `affectedFlowIds`. The candidate shape, its evidence, and the invalidation when a confirmation input goes missing are still checked. |
| service-recordings/tests/recorded-gap | "carries the recorded gap between two recorded steps onto the later candidate" | Approving into a Flow and the executor run. This file was the only test of the proposal-side gap measurement (`proposal-generation.ts` `gapBeforeCandidate`), so I kept that half. The executor's use of the ceiling is covered in `executor/tests/ladder-run.test.ts`. |

I also removed the helpers and imports that only the removed code used, and updated each file's header comment. In `candidate-definitions.test.ts` that leaves only the direct-function `describe` and `productSchema`. In `proposal-candidates.test.ts` I removed `approvedGraph`, `datasetSummary` and three imports. I removed the `getPrimarySubflowGraph` import from three files.

### Refusal tests for the retired entry points

I added none, because both entry points already have one. `runtime/service/instruction-led/tests/service.test.ts:96-101` asserts that `reviewRecordingFlowProposal(... decision: "approved")` and `approvePolicyProposal` reject with `automation.instruction_led_authoring_required`. It also asserts that nothing changed: no `saveFlow`, no dispatch, no resolver call, no recording-derived definitions. Line 70 asserts the same refusal for a projectless `approvePolicyProposal`. `service/proposals/approval.ts:42` is reachable only through `service.approvePolicyProposal`, which now throws before delegating to it, so the service-level test covers it.

## Commands run and observed results

All run in `C:/Users/osrs_/FluxStuff/fxwork/t545/!FluxIQ`. Vitest ran from `packages/fluxiq` on the 15 Group B paths, with `service-recordings/tests/` passed as a directory.
- `pnpm.cmd --filter @fluxiq/contracts build` -> build-cache "reuse".
- Before: "Test Files 15 failed (15)", "Tests 118 failed | 16 passed (134)".
- After the fixture fixes, before the deletions: "Test Files 6 failed | 9 passed (15)", "Tests 19 failed | 115 passed (134)". All 19 failed with the retired-approval refusal.
- Final: "Test Files 15 passed (15)", "Tests 123 passed (123)", 181 s.
- `pnpm.cmd exec vitest run src/programs/automation-studio/runtime/service/instruction-led/tests/service.test.ts` (the refusal tests) -> "Tests 14 passed (14)".
- `pnpm.cmd --filter fluxiq check` -> exit 0.
- `node scripts/structure-audit.mjs` -> "structure-audit: passed (347 warning(s), 1156 baselined)." One fewer warning than before, because `candidate-definitions.test.ts` is now 147 lines.
- `git diff --check` -> exit 0.
- `git diff --stat` -> 17 files changed, 84 insertions(+), 807 deletions(-).

## Not verified

- No full suites (per the rules).
- **`storage-restart.test.ts` flake.** In one group run, "preserves undo then fresh public input without packet IDs (2/'domain_event')" hit the 15 s test limit under parallel load. Alone it takes about 3.0 s, and the whole file took 115 s for 28 tests. It passed in the two group runs after that. I did not change its limits, so it can come back under heavy load.
- I did not rebuild `packages/fluxiq/dist`, which the probes import. It already includes t519's description check.

## Open questions or contradictions found

- `service-recordings/tests/proposal-approval.test.ts` no longer contains any approval test; its two remaining tests are about proposals. A later structure pass might rename or merge it. I left the filename as it is.
- These deletions lose coverage of the behaviour of approved recording definitions: definition shape, visibility, the records port, For Each over records, and choosing the start node. If any of that comes back through the instruction-led build, it will need new tests there.
