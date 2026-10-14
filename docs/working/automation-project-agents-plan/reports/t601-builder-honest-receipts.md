# t601 builder-honest-receipts: worker report

Brief: `builder-honest-receipts`. Core worktree `fxwork/t601/!FluxIQ`, branch `task/t601-builder-honest-receipts`.
Paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/`. Nothing committed. No live run,
and nothing that could reach a model provider ran: every test uses scripted or mock providers.

## Outcome

Done. All three items are in, each with a test. The subflow-candidate, conversations, project-build and
flow-bootstrap/candidate sets pass. Typecheck is clean and the structure audit passes.

## What changed and why

1. **A passing receipt counts as done, whatever else the completion carries** (`flow-bootstrap/subflow-candidate/builder-loop.ts`).
   - Before: `checkCompletion` sent any result with a key a receipt lacks to `endingCheck`. That check refused the
     shape first and named only the ending shape. So `{subflowKey, revision, digest, ended: "partial", reason}` was
     refused `subflow.ending_shape` even when a yes stood for that proposal.
   - Now the completion is read by its keys:
     - Receipt keys only: read as a receipt, as before.
     - Ending keys only: read as an ending, as before.
     - Both, naming the latest proposal: if a yes stands for that proposal with its entry prepared, it counts as the
       receipt and `ended`/`reason` are ignored (`gate.completion` returns ok, so the outcome has no `ended`). If no
       yes stands, the `ended`/`reason` part is taken as the honest ending, under the usual too-soon and after-yes
       rules.
     - Both, but not naming the latest proposal, or any key that belongs to neither shape: refused
       `subflow.ending_shape`, and the refusal names exactly one shape. Where a yes stands, that is the exact receipt
       ("Revision N ... passed its trial, so the brief is done: complete with exactly {...} and nothing else.").
       Otherwise it is the honest ending ("No trial answered yes for the latest proposal ... send exactly
       {"ended": ...} ... and nothing else. The receipt ... is sent only once core.test_subflow has answered yes
       for that revision.").
   - The schema now agrees with the check. `completionSchema(subflowKey)` keeps the same five `properties`, so tests
     and scripted models that read `completionSchema.properties.subflowKey.const` still work. It adds
     `anyOf: [{required: [subflowKey, revision, digest]}, {required: [ended, reason]}]` and a `description` saying a
     receipt whose trial answered yes is taken as the brief done whatever else it carries.
   - The header has a t601 paragraph. The `HONEST_ENDING`, submit-tool and trial-gate `yes` texts are unchanged.
2. **A "not judged" result the judges answered yes to now says so** (`flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`).
   - New `instructionFor(answer)`, used both in the test tool's evidence and in the completion refusal.
   - Trigger: a `not_judged` whose `feedback.why` matches `/\bexclusion evidence\b/iu`.
   - Instruction it gets: `NOT_JUDGED_AFTER_YES`. It says the judges answered yes and none answered no, but Core
     could not confirm that yes. It says the judges accepted the rows this subflow kept, so do not rewrite it or
     change which rows it keeps. It says to test the same revision again and, if the retests run out held the same
     way, to complete with `{"ended": "partial", ...}`.
   - Every other `not_judged`, and every other verdict, keeps its old text. `flow-bootstrap/candidate/trial-gate.ts`
     was not touched.
3. **The time limit has its own chat words, in Core's words.**
   - `conversations/commands/progress.ts`: `supervisorEndingWords` checks for `project.build_time_limit` before the
     supervisor-ending words.
     - With `project.build_blocked`, or no outcome code: "it reached its time limit before a whole test of the Flow
       passed".
     - With `project.build_partial`: the same, plus ", with only part of the Flow built".
     - So the person reads "The build failed: it reached its time limit ..." instead of "the supervisor ended it ...".
   - `service/project-build/run.ts`: when the supervisor's outcome is `timedOut` and no candidate was assembled, the
     chat row before the throw now has:
     - title: "The build reached its time limit of 30 minutes before a whole test of the Flow passed."
     - text: what was tested and what is left. For example: "Its one part did not pass its own test. Left: a part
       tested once whose last test could not be confirmed. The whole Flow was not assembled, so it was never tested
       as one." After that comes Core's note of what is left on the target, as before.
   - How the counts are made:
     - Subflows are the latest plan's `partOf` keys, read from the build record.
     - Trials are counted by wrapping `proposals.trialled` inside `run.ts`, so `proposals.ts` is unchanged.
     - The row uses counts and verdict words only: no subflow names, and never the model's reason.
     - The limit comes from `AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS`, in the same spoken form the supervisor
       uses.
   - The failure's code and issue codes are unchanged:
     `flow_bootstrap.post_provider_validation_failed` with `[project.build_time_limit, project.build_<outcome>]`.

Tests:
- `flow-bootstrap/subflow-candidate/tests/builder-ending.test.ts`:
  - The schema pin is updated, and `anyOf`/`description` are checked.
  - New `describe("a receipt sent beside an ending")`: done on a yes with no `ending_shape` refusal; the honest
    ending when no yes stands; one-shape refusals for a stale mix and for a wrong shape after a yes.
- `flow-bootstrap/subflow-candidate/tests/subflow-trial-gate.test.ts`: both real hold reasons, word for word, get the
  new instruction from the test tool and from the completion refusal. A deadline `not_judged` keeps the old text,
  pinned exactly.
- `conversations/commands/tests/plain-failure.test.ts`: time-limit words for blocked, partial and bare.
- New `service/project-build/tests/project-build-time-limit.test.ts`, run through the actual service:
  - It mocks `loop-limits/index.ts` to an 8 s bound with a 2 s ending.
  - A scripted builder submits, gets one unsure trial and ends partial. The scripted supervisor then waits out the
    clock.
  - It asserts the diagnostic, the time-limit row's title and its full text, that the "supervisor ended" row is
    absent, and that the model's reason is not in the time-limit row.

## Commands run and observed results

All from `packages/fluxiq` in the worktree:

- `npx vitest run src/programs/automation-studio/runtime/service/project-build src/programs/automation-studio/runtime/conversations src/programs/automation-studio/runtime/flow-bootstrap/subflow-candidate`
  -> `Test Files 44 passed (44)`, `Tests 338 passed (338)`. This ran on the final source; only test files changed
  after it.
- `npx vitest run src/programs/automation-studio/runtime/flow-bootstrap/candidate` (pins) -> `Test Files 17 passed (17)`,
  `Tests 145 passed (145)`.
- After the last test edits: `npx vitest run .../flow-bootstrap/subflow-candidate .../service/project-build/tests/project-build-time-limit.test.ts .../conversations/commands/tests/plain-failure.test.ts`
  -> `Test Files 10 passed (10)`, `Tests 71 passed (71)`.
- `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/check-t601.tsbuildinfo`
  -> no output, exit 0. The first two runs found three test-only type errors and a missing `!`; all were fixed.
- From the worktree root, `node scripts/structure-audit.mjs` -> `structure-audit: passed (360 warning(s), 1156 baselined).`
  An earlier run failed `[imports]` because a test imported `result-verification/agreement.ts` directly; that was
  fixed (see open question 2).

## Not verified

- No live builder or Lab run, so whether real builders stop mixing the two shapes, and stop rewriting a subflow after
  a held yes, is unmeasured.
- `project-agents/dispatch/ending.ts` (RC1 fix 2 in the social debug: `done` whenever a yes stands) was out of scope
  and is unchanged. A builder stopped by a guard with a yes standing still returns `partial`.
- The full `pnpm check` and `pnpm test` suites were not run, per the twice-a-day rule.

## Open questions or contradictions found

1. **Item 2 detects the held yes from text.** The only signal the trial feedback carries is `why`. It holds the reason
   string from `result-verification/agreement.ts:129` or `verdict.ts:178`; `build-test/judge.ts:272` passes it
   through, and `service/candidate-trial/feedback.ts:204` keeps only `why`. Both strings contain "exclusion evidence",
   and the gate matches on that. Neither file is mine to edit. The structural fix is fix 3 of the everything-store
   debug: a field such as `answeredYes` on the feedback. The gate test pins both strings word for word, so a change to
   either fails it.
2. `result-verification/index.ts` does not export `agreement.ts`, so the gate test cannot call the real agreement to
   get the reason. It uses the two literal strings instead.
3. Item 3's progress words cannot name what was tested, because the diagnostic carries only codes. Those details are
   in `run.ts`'s chat row, shown just before the "Build failed: ..." line. Only codes in that list may carry a
   diagnostic `ending.message` (`failure-state.ts` `ENDING_CODES`), and `post_provider_validation_failed` is not one
   of them.
4. Count of the person-facing "parts": in `run.ts` a "part" is one of the plan's subflows, while the task spec uses
   "parts" for the person's own parts. Both are counts, so the wording works, but the supervisor may want one word for
   both.
