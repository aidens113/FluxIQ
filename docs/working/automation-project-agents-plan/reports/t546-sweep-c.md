# t546-sweep-c: Group C of the 2026-10-13 Core sweep

## Outcome

Done. All 30 Group C files pass. Only files under `tests/` directories changed. No product gate was relaxed, and no shared helper changed: `createRunnableCanonicalFlow`, `createFailingCanonicalFlow`, `installPrimaryRouter` and the `service-bootstrap/tests/fixtures.ts` helpers are untouched.

Two causes account for most failures:

- **t519 (`18ee3f60`)**: a run, build or publish now needs written instructions, and a recording needs a description. The usual fix was to save the Flow's instructions with `saveFlowGenerationInstruction(...)` and add a `description` to each recording.
- **t530 (`d6f6e88d`)**: a run's chat ending now always adds a sentence about whether the run kept a change. Four stubbed `run-runtime-session` answers left out `durableBehaviorChanged`, which the real handler (`api/handlers/runtime-execution.ts:119`) always sends. The stubs now send `false`, and the tests expect the matching sentence.

## What changed and why, per file

Recording description missing (added `description: "Shows the steps the automation repeats."` to each recording):
- `framework/tests/index.test.ts`: 1 `createRecording`.
- `runtime/tests/io-bridge.test.ts`: 5 calls, including the `identityRecorder` helper.
- `runtime/service/tests/object-documents.test.ts`: 1 call.
- `runtime/service/paths/tests/rootless-storage.test.ts`: 2 calls.
- `runtime/tests/service-flows/tests/creation.test.ts`: 1 call.
- `storage/project/recording-stream/tests/claim-restart.test.ts` and `claim-process-probe.mjs`: the forked probe's `createRecording` had no description, so the child exited before it was ready. After the fix, the probe's three child processes took about 13.5 s standalone, and the test hit vitest's 15 s default twice. I gave the test `{ timeout: 60_000 }`, as the other spawn tests have. It then passed in 11.1 s.

Flow had no active instructions (saved instructions through `saveFlowGenerationInstruction`, in a local helper or fixture where the file had one):
- `framework/tests/model-provider-disabled-run.test.ts`, `api/handlers/tests/runs.test.ts`, `api/handlers/tests/cancel-runtime-session.test.ts`, `tests/conversation-parking.test.ts` (in `approvalFlow`), `run-detail-read/tests/flow-run-detail-reader.test.ts` (in `completedRun`), `summaries/tests/run-detail-preservation.test.ts` (in `repairedRun`), `service-flows/tests/cancel-parked-run.test.ts` (in `storedRun`), `service-flows/tests/requirement-gate.test.ts` (in `flowRequiring`), `service-flows/tests/representation.test.ts` (each parent Flow, the two migrated legacy Flows, and the `createRoutedGateFlow` / `createRoutedFlowTypingBoundInput` helpers).
- `service-flows/tests/canonical-persistence.test.ts`: `publishFlow` also needs instructions, so the published child Flow needed them too.
- `service-flows/tests/execution-digest.test.ts`: each `createFlow` in tests 2 to 4 (11 Flows), because publishing needs them. Test 1 is unchanged.
- "Unknown Automation Studio Flow: flow.1 / flow.root / flow.transport / flow.production": the fixtures in `command-context/tests/controller.test.ts`, `command-execution/tests/controller.test.ts` (also `flow.parent`), `command-execution/tests/required-transport.test.ts`, `command-execution/tests/service.test.ts`, `command-run/tests/controller.test.ts` and `command-run/tests/controller-withdraw.test.ts` started a run from an inline Flow document that was never stored. The instruction authority calls `getFlow`. Each fixture now creates the Flow under the same id and saves its instructions first.

Assertions that pinned behaviour t519 deliberately changed (the supervisor should check these):
- `command-execution/tests/service.test.ts`:
  - A run with no `projectId` is now refused by the instruction gate (`service.ts:2465`) before `AutomationStudioRequiredCommandRun` can throw `storage_required`. That refusal can no longer be reached through `runRuntimeSession`. The test now expects the instruction refusal there.
  - `storage_required` is still pinned, by constructing `AutomationStudioRequiredCommandRun` directly with no project, and with no storage.
  - The idempotent replay `runRuntimeSession({ projectId, idempotencyKey })` named no Flow, so the gate refused it. It now passes `flow`, the same Flow as the first call, and still expects `idempotency_mode_mismatch`.
- `service-bootstrap/tests/rejections.test.ts` ("rejects missing / disabled / out of scope instructions") and `accounting.test.ts` (the pre-provider case):
  - Since t519, `instructionAuthority.assert` (`service.ts:1520`) runs before Flow Bootstrap's own `flow_bootstrap.active_instructions_required` check. A build with no usable instruction now rejects with `AutomationInstructionError` (`diagnostic.code: "automation.instructions_required"`), not a Flow Bootstrap error with stage and provider-accounting fields.
  - The tests now expect that error. The resolver and provider still never run, and no topology is written.
  - The "out of scope" case also failed because saving an instruction scoped to a Flow that does not exist is refused. It now creates `flow.other` first.
- `service-flows/tests/runs.test.ts`:
  - Three tests ran a deprecated owner-bound Flow from `createDefaultFlow` plus `saveProjectArtifact`. Its id is not in the canonical store, so `getFlow` fails, and it can never hold instructions. Since t519, such a Flow cannot be run at all.
  - "pages runtime run summaries" and "persists compact action comparisons" now run a canonical Flow (`createFlow` plus `installPrimaryRouter`, same graph) with instructions.
  - "stores project artifacts and runtime sessions in project folders" keeps the legacy artifact for its storage assertions. It runs a separate canonical Flow with the same graph.
  - The other runnable-Flow tests in the file save instructions.
- `conversations/commands/tests/plain-failure.test.ts`:
  - `flow.improve` now refuses a caller with no person turn (t519, `improve.ts:53`). The blank-target test now gives the context a person turn (`host.personWords` plus `answerTurnId`) and expects the person-worded ending.
  - A new test pins the refusal of an improvement with no person turn, and that nothing is saved.
  - The failed-run test follows the t530 wording.
- `conversations/tests/person-words.test.ts`: the improve leg of the fallback test now expects the t519 refusal, with nothing saved. I updated the header comment to match. The create-here and explore fallbacks are unchanged.
- `api/handlers/tests/conversations.test.ts`:
  - `flow.describe` read no person words. The mocked conversations had no `personWords`, and since t519 an answer turn with no words cannot fall back to the model's argument (`argument.ts`). The test's override now supplies `personWords`.
  - The run test follows the t530 wording.
- `conversations/commands/tests/execute.test.ts`: the t530 wording only.

## Commands run and observed results

All run from `C:/Users/osrs_/FluxStuff/fxwork/t546/!FluxIQ`. The vitest runs were from `packages/fluxiq`.
- `pnpm.cmd --filter @fluxiq/contracts build` -> `"build-cache":"reuse"`, inputs and outputs match the stamp.
- Before the fix, `pnpm.cmd exec vitest run <30 group files> --reporter=dot` -> "Test Files 30 failed (30); Tests 104 failed | 133 passed (237); Errors 1 error".
- After the fix, the same command -> "Test Files 30 passed (30); Tests 238 passed (238)". The count went up by one because of the new plain-failure test.
- `pnpm.cmd --filter fluxiq check` -> exit 0.
- `node scripts/structure-audit.mjs` -> "structure-audit: passed (348 warning(s), 1156 baselined)."
- `git diff --check` -> exit 0. The only output was LF/CRLF autocrlf warnings. The diff is "31 files changed, 132 insertions(+), 65 deletions(-)", with no whole-file line-ending rewrites.

## Not verified

- No full suites (per the rules), and no Group A or B files.
- `claim-restart.test.ts` reads the built `packages/fluxiq/dist`. The `dist` in this worktree was built at 20:05, after this branch's last commit. I did not rebuild it.
- I did not check the UI or the extension for callers that rely on a Flow Bootstrap typed diagnostic when a build is refused for missing instructions.

## Open questions or contradictions found

1. **Typed diagnostic for missing instructions.** A build refused for missing instructions now surfaces `AutomationInstructionError`, not a `Flow Bootstrap generation failed (flow_bootstrap.active_instructions_required)` error with stage and provider-accounting fields. Flow Bootstrap's own check after the authority is now effectively unreachable for that case. If callers or the Lab classify build failures by the bootstrap diagnostic, this is a product question. I updated the tests to the current behaviour rather than change product code.
2. **`storage_required` unreachable.** Through `runRuntimeSession`, `command_execution.storage_required` can no longer be reached for a run with no project, because the instruction gate fires first. It is pinned only at the class level now.
3. **Deprecated Flows can no longer run.** Owner-bound Flows from `createDefaultFlow` cannot hold instructions, so since t519 they cannot be run. No product code calls `createDefaultFlow`; only tests do. If such Flows should still be runnable, that is a product gap, not a test gap.
