# t683: held-ending reset reason, durable fallback

## Outcome

Done. Item 1 was still open and is now built. Item 2 has no restart path, so nothing was persisted. The evidence for that is recorded in the `state.ts` header.

## What changed and why

### 1. Reset reason (open, now closed)

t638 changed the words after a reset (`GUIDANCE.next.afterReset`) to read "If you sent it because your ending was held for a reset ... end again now. Otherwise test". The model still had to remember why it had sent the reset. The nothing-assembled and cannot-retest variants did not mention a held ending at all. Nothing in Core recorded the reason, so the follow-up was still open.

- `supervisor/state.ts`: a new exported type, `AutomationStudioProjectSupervisorResetToEnd`, with three cases:
  - `{ by: "ending" }`
  - `{ by: "completion"; complete: { revision, digest } }`
  - `{ by: "core" }`

  A new field, `resetToEnd`, holds it. Three things clear it, because each means the build is going on: `adopt` (a plan taken into force), `noteWholeTest` (a whole test ran), and the dispatch tool sending any brief that is not a reset. The header paragraphs are updated to match.
- `supervisor/completion.ts`: `resetFirst(held)` sets `state.resetToEnd` each time it refuses `project.completion_reset_first`. An honest ending sets `ending`. A completion that names the fallback sets `completion`, with the fallback's revision and digest. Header paragraph added.
- `supervisor/dispatch-tool.ts`:
  - When `resetToEnd` is set, a call of resets only gets new `next` words from `AFTER_RESET_TO_END[by]`, whether the reset came back done or not. The words say to end again now, or to complete again with the object under `completeAgain`, which is added to the answer for `completion`. They never mention `core.test_candidate`.
  - `repeatedReset` refuses with `RESET_REPEATED_TO_END[by]` and the same `completeAgain`, in place of `resetRepeatedTest`/`resetRepeatedEnd`.
  - A call that sends any brief other than a reset clears the reason.
  - The new words are local constants because `guidance.ts` was not in my owned list.
  - Header paragraph added.
- `supervisor/supervisor-loop.ts`: `resetBeforeEnding` sets `state.resetToEnd = { by: "core" }` before Core sends its own reset, so that dispatch's answer says the build ends now. Doc comment updated.
- Reset brief's own words (`dispatch/reset-loop.ts`): left unchanged. The reset run is never told to test: its refusal says "Complete once none is left", and `brief-ports.ts` says "never 'test again', since a reset has no test". So the reset builder needs no reason. Passing one would also need `dispatch/run-brief.ts` (must not touch) and the brief contract (not owned).

### 2. Durable fallback (no restart path, so not persisted)

The evidence:

- `service.ts:1588` mints `buildId: \`build.${randomUUID()}\`` for every project build, and `service/project-build/run.ts:161` builds the record ref from it. `supervisor-loop.ts:223-226` therefore never finds an existing record in production. `state.load(view)` runs only in tests.
- The fallback's revision and its yes are read through this run's `AutomationStudioFlowCandidateSubmissionController` and `AutomationStudioFlowCandidateTrialGate` (`standingRescue`, `latestPass`). Both are created per run, in memory, and the candidate id is minted per build as well. A persisted fallback would name a revision and a trial that no restarted run could test, read or promote.
- The working document's Build Record section (around line 161) says: "Resuming a half-finished build after a Core restart is post-MVP".

I recorded this in the `state.ts` header ("The fallback is kept in memory only, and no restart reads it (t683)") and on the `fallback` field's doc. The note says to persist the fallback only together with a resume path that also restores the controller and the gate's standing. `record/**` is unchanged.

### Tests

These are in `supervisor/tests/reset-next.test.ts`. A separate file pushed `supervisor/tests/` to 26 files, which failed the structure audit's 25-file limit, so the new tests were merged into this file.

- The existing nothing-assembled test now expects the new words ("end again now", the code, and not `afterResetNothingAssembled`).
- New cases:
  1. An assembled Flow, its test answered no, and the ending held: the words say to end again with no test, and no acts are left.
  2. The reset comes back blocked (`undoes: false`): the answer still says to end again, and a repeated reset is refused with the end-again words, not `resetRepeatedEnd`.
  3. No ending was held: the answer is still `afterReset`.
  4. The ending was held, then another build brief was sent: the reset is answered `afterResetNothingAssembled` as before.
  5. A completion naming the fallback was held: the reset's answer carries `completeAgain: { revision: 1, digest }`, the complete-again words, and no test; the build then completes on revision 1.

## Commands run and observed results

- `npx tsc --noEmit -p .` in `packages/fluxiq` -> exit 0, no output. Run before and after the test merge.
- `npx vitest run src/programs/automation-studio/runtime/project-agents` -> "Test Files 53 passed (53), Tests 389 passed (389)". The run before the merge showed 54 files and 389 tests.
- Checks that the tests depend on the change, with the code put back each time from a scratch copy (`git status` shows only the five intended files):
  - With `toEnd` forced to undefined in `dispatch-tool.ts`, the three held-reset cases failed, and the tightened reset-next case failed (1 failed, 2 passed).
  - With the non-reset-brief clearing disabled, the "build went on" case failed (1 failed, 4 passed).
- `node scripts/structure-audit.mjs` (repo root) -> first run: `FAIL [directory-files] .../supervisor/tests/: 26 source files exceeds the 25-file limit`, fixed by the merge. After the merge, no FAIL, only advisory warnings. `dispatch-tool.ts` is now 539 lines, `state.ts` 556 and `supervisor-loop.ts` 430; they were already past the 400-line advisory before this change (498, 515 and 426).

## Not verified

- Core's own reset (`by: "core"`): no test observes its answer. No model reads the result of `resetBeforeEnding`, and the run outcome does not expose the state. The flag being set there was checked by reading the code only.
- No live run.

## Open questions or contradictions found

1. **A whole test after a reset no longer holds the ending (existing behaviour, not changed).** `resetCameBackLast()` asks only whether the latest brief was a reset that came back. A whole test run after that reset leaves its own act on the target, yet the next ending is let through without being held: the build is assembled, a reset is sent, the test leaves act-2 in place, and the ending is accepted. The reset rule's wording, "until a reset brief has come back after the build's last other brief", does not count whole trials. The ending still names what is left, but no reset is asked for. A fix would mark the last whole test in the state (`noteWholeTest`) and compare. Needs a supervisor decision.
2. **A test refused for a reset keeps the reason.** If the ending was held and the model then tries `core.test_candidate`, the test is refused `project.trial_reset_required` before `noteWholeTest` runs. `resetToEnd` stays set, so the answer after the reset says to end again, not to test. Clearing it needs one line in `whole-trial.ts` (must not touch): `this.input.state.resetToEnd = undefined` at the start of `test`, before the `candidate.trial_reset_required` branch.
3. **The old t638 sentence is now redundant.** `GUIDANCE.next.afterReset` still says "If you sent it because your ending was held ... end again now. Otherwise test". When the reason is set, that branch is no longer reached. The sentence could be cut to "test the latest assembled Flow", and the new constants moved from `dispatch-tool.ts` into `guidance.ts`. I did not own `guidance.ts`. The reset-next test `puts ending again first ...` pins the current sentence.
