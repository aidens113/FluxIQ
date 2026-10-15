# t621 supervisor-outage-reset-and-reason: worker report

## Outcome

Done. This closes t619's open questions 1 and 2, plus the note order raised in t619's follow-up.

- **No reset during an outage.** When the model provider stops answering, the project supervisor no longer sends Core's reset brief, because that brief would run on the same silent provider. Instead, the ending names each act of the build that is still on the target.
- **Recorded reason.** The build record's reason now says the provider stopped answering, under `flow_bootstrap.provider_unavailable`. It no longer says "The supervisor stopped ... (llm_evidence_loop.provider_unavailable)".
- **Note order.** In project mode, the note about what is left on the target now comes before the "try again later" advice.
- **Other endings.** Every other ending still resets exactly as before.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### `project-agents/supervisor/supervisor-loop.ts`

- **Detecting the outage.** `unanswered` is set when the loop returned `llm_evidence_loop.provider_unavailable` and the build was neither timed out nor cancelled.
- **Recording the reason.** A new branch in `finished` records `providerStoppedReason(loop.providerUnavailable, leftOnTarget.undoable)`. It uses the same opening words as the person's ending from t619:
  - "The build stopped because the AI model provider did not answer: N requests in a row got no answer -- <closed words>". For `llm.provider_network_error` it says "could not be reached" instead.
  - It then adds ", before a whole trial passed (flow_bootstrap.provider_unavailable)."
  - When a reset could have undone something, it adds "No reset was sent to put the target back: it would need the same provider."
  - Core's existing left-on-target note follows, through `.reason(...)` as before.
- **Skipping the reset.** `resetBeforeEnding` is skipped when `unanswered` is set. It still runs for a guard stall and for the time limit.
- **Supporting changes.**
  - New constants: `PROVIDER_STOPPED`, `PROVIDER_ENDING_CODE` and `UNREACHABLE`.
  - A type-only import of `AutomationStudioLlmEvidenceLoopProviderUnavailable` from `llm/index.ts`.
  - A header paragraph explaining the change.
- No text the model sees changed. The reason is record-only; `toldEnding` never shows it to the person.

### `service/project-build/run.ts` (note order only)

- `toldEnding`: for a `provider_unavailable` ending, the note is now placed by a new `beforeAdvice(message, note)`. It puts the note before the message's last sentence, which is the advice.
  - The note is kept whole and the opening gives way, as `fitted` already did.
  - If the note leaves no room for the advice, it falls back to the old behaviour: the note last, with no advice.
- `fitted` takes an optional `max` (default `MAX_MESSAGE`) so that room can be kept for the advice.
- Every other ending kind still uses `fitted` unchanged.
- The header paragraph from t619 was extended.

### Tests

- **New:** `project-agents/supervisor/tests/provider-stopped.test.ts`, with 3 tests.
  - **Outage after a lasting act.** The builder makes a lasting act (act-1 in place), then 3 supervisor decisions throw `llm.provider_timeout`. The test checks:
    - dispatches are only `[["build","build"]]`, so no reset was sent;
    - act-1 is still in place;
    - the ending is `partial`;
    - the whole reason is pinned, including the left-on-target note naming the act.
  - **Unreachable provider, nothing left.** The full `could not be reached` reason is pinned, the ending is `blocked`, and nothing was dispatched.
  - **A guard stall still resets.** Dispatches are `[["build","build"],["reset"]]`, every act is undone, and the reason still says "The supervisor stopped".
- **Changed:** `service/tests/provider-unavailable-authoring-modes.test.ts`. The project-mode `SILENT_ENDING` is now pinned as "... Nothing was built: no Flow was created or changed. Nothing this build did is still on the target. What the Flow should do is kept, so you can try again later, once the provider is answering."

## Commands run and observed results

All were run in `fxwork/t621/!FluxIQ/packages/fluxiq`, one at a time, with nothing heavy running beside them.

- `npx vitest run .../project-agents/supervisor/tests/provider-stopped.test.ts`: 3/3 passed.
- **Check that the new tests can fail.** I put back the original `supervisor-loop.ts` with `git checkout` and reran the new test file: 2 failed, 1 passed.
  - Received `["build","build"],["reset"]`, which shows a reset was sent.
  - Received the reason "The supervisor stopped before a whole trial passed (llm_evidence_loop.provider_unavailable)."
  - I then restored the edited file.
- `npx vitest run .../project-agents`: 36 files, 275 tests passed.
- `npx vitest run .../service/project-build .../service/tests/provider-unavailable-authoring-modes.test.ts`: 15 files, 74 tests passed.
- `npx tsc --noEmit -p .`: exit 0.
- `node scripts/structure-audit.mjs` (repo root): "structure-audit: passed (362 warning(s), 1156 baselined)." None of the warnings are in the touched files.

## Not verified

- No live run and no loaded runs, as the brief instructs.
- No project-mode test end to end through the service where a builder's act is left and the provider then goes silent, which would pin a message with a "Still on the target" note before the advice. The supervisor test pins the record side. The service test pins the order using the "nothing left" note. Both note forms go through the same `beforeAdvice` path.
- `conversations/**` tests were not run, since nothing there changed.

## Open questions or contradictions found

1. **Stale words in a conversations test.** `conversations/commands/tests/provider-unavailable-ending.test.ts` builds its own project-mode diagnostic using the old order: it appends `NOTHING_LEFT` after the advice in both `diagnosticOf` and `ANSWER.project`. Its comment says the service test "pins the same words end to end", which is no longer true. It still passes, because it builds its input itself. I could not edit it, since it is under `conversations/**`. A follow-up should put the note before the advice in both places.
2. **Code string in the record reason.** The record reason names `flow_bootstrap.provider_unavailable` as a literal string. Importing the code from `flow-bootstrap/generation-failure` was avoided to stay out of that area. If a constant for it exists or is added, the supervisor could import it.

## Follow-up (coordinator, same worktree): conversations test brought to the new order

### Outcome

Done. Open question 1 above is closed. In `conversations/commands/tests/provider-unavailable-ending.test.ts`, the project-mode diagnostic and the pinned answer both put the target note before the advice.

### What changed and why

- **`diagnosticOf("project")`.** It no longer adds a hand-written note to the end of the message. It takes Core's own message from `flowBootstrapEvidenceLoopFailure(SILENT, undefined, undefined, "said_by_caller")` and passes it to a new test helper, `withNoteBeforeAdvice`.
  - The helper inserts `NOTHING_LEFT` before the message's last sentence, which is the advice, the same place `run.ts`'s `beforeAdvice` puts it.
  - As a result, Core's ending wording is never copied into the input. If that wording changes, the input follows it.
  - The note's position is still restated in the test rather than imported. `run.ts` does not export `beforeAdvice`, and the structure rules allow one export per file. Moving it into its own module in `service/project-build/` would let the test import it. That was outside this brief.
- **`ANSWER.project`.** It is re-pinned as a literal: "... Nothing was built: no Flow was created or changed. Nothing this build did is still on the target. What the Flow should do is kept, so you can try again later, once the provider is answering. The Flow "Hubs" has no steps yet."
  - It stays a literal on purpose, because it is the assertion.
  - It now matches the service test's `SILENT_ENDING.project`.
- **Doc comment.** The comment on `NOTHING_LEFT` now says the build puts the note before the advice.

### Commands run and observed results

All were run in `packages/fluxiq`, one at a time.

- `npx vitest run .../conversations/commands/tests/provider-unavailable-ending.test.ts`: 1 file, 4 tests passed.
- `npx vitest run .../conversations/commands`: 10 files, 126 tests passed.
- `npx tsc --noEmit -p .`: exit 0.
- `node scripts/structure-audit.mjs` (repo root): "structure-audit: passed (362 warning(s), 1156 baselined)."
