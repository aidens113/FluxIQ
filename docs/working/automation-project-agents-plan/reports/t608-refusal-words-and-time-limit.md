# t608: refusal words and time limit (worker report)

## Outcome

Done. Both parts are implemented and tested. Every check named in the brief was run and passed.

## What changed and why

### (1) Every script and subflow refusal a builder can meet has words

- `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/issue-feedback.ts`: `AUTHORED_CODES` gains every `flow_script.*` code the source raises that was missing (21 codes, `part_interface_invalid` among them) and the 17 `subflow.*` scope-issue codes. The issue feedback now keeps Core's sentence for each of them.
  - I read every raising call site before adding a code. Each message is Core's own wording. It quotes only lines, labels, inputs, outputs, ports and node ids the model wrote, and where it quotes free text it cuts that text to 40-64 characters. None passes on a validator's or a provider's message.
  - One exception: `flow_script.way_out_accepts` also quotes the words of the control the step pressed. The model was shown those words; the code comment says so.
  - The `subflow.*` scope issues already carry their messages through `scopeRefusal` (`subflow-candidate/scoped-submission.ts`). They are listed here so that no path feeding them through the issue feedback drops the message.
- New test `flow-bootstrap/plan/tests/issue-feedback-words.test.ts`. This is the mechanical check:
  - It reads every non-test `.ts` under `flow-bootstrap/`, except `issue-feedback.ts` itself.
  - It collects every `"flow_script.<code>"` literal (51 codes) and every `code: "subflow.<code>"` issue literal (17 codes).
  - It sends each code through `automationStudioFlowBootstrapIssueFeedback` with a sentence and fails, listing the code, if any comes back without that sentence.
  - It also replays 0153's two shapes through the real `acceptAutomationStudioFlowBootstrapResult`: an `input:` on a block no step calls, and a part output no step gives. It checks that both sentences reach the builder.
  - I proved it catches a gap: I removed `part_interface_invalid` and `subflow.input_unread` from the set, and 3 tests failed, naming exactly those two codes. Then I restored the file.

### (2) A draft the time limit kept now says it was the time limit

- `service/project-build/run.ts`, in the ending path only. When `outcome.timedOut && outcome.status === "ended"` and the standing trial was not a yes, two things now happen:
  - The build emits the same t601 chat row as the case where nothing was assembled. It says the limit, what was tested of the latest plan's subflows, and Core's note of what is left on the target.
  - `timeLimitWords` takes an optional `assembled` argument, so the row's last sentence now says either "A whole Flow was assembled and tested from its start, and its last whole test <verdict>; it is kept as a draft, and nothing was put into the Flow." or "…assembled and never tested from its start; …" instead of "The whole Flow was not assembled".
  - The draft's trial goes back with `feedback.code = "project.build_time_limit"`, and the trial's own code is kept beside it as `feedback.trialCode`. Promotion turns that into the draft result's `trial.codes`.
  - `"project.build_time_limit"` is now a single file constant, also used for the existing failure issue code. The header comment has a t608 paragraph.
- `conversations/commands/create-here.ts`: a draft whose `trial.codes` include `project.build_time_limit` is answered "The build reached its time limit before a whole test of the Flow passed. Its last test run from the start was judged not to do what you asked, so nothing was put into the Flow. I kept what I wrote as a draft." This matches the t601 row and `progress.ts`'s `TIME_LIMIT_WORDS`. Every other draft reads as before. The new helper is file-private, to keep one export per file.
- Tests:
  - `service/project-build/tests/project-build-time-limit.test.ts`: a new case runs through the actual service with an 8 s limit. A scripted supervisor plans, dispatches (the subflow trial says yes), assembles, and runs a whole test (judged no), then waits out the clock. The test asserts the result is `draft` with `trial: { verdict: "no", codes: ["project.build_time_limit"] }`, and that the chat row's title and text are as above. The service setup moved into a `serviceWith` helper.
    - Run against the HEAD version of `run.ts`, the new case fails: the received code is `"candidate.trial_judged_no"`, not `"project.build_time_limit"`.
  - `conversations/commands/tests/execute.test.ts`: a new case runs `flow.createHere` on a draft with that code and asserts the exact reply above, with no apply and no "is ready".

## Commands run and observed results

All commands were run from `C:/Users/osrs_/FluxStuff/fxwork/t608/!FluxIQ/packages/fluxiq` unless noted.

- `npx vitest run …/flow-bootstrap/plan/tests/issue-feedback-words.test.ts` → 4 passed. With two codes removed from the set → 3 failed, naming those two codes.
- `npx vitest run …/service/project-build/tests/project-build-time-limit.test.ts` → 2 passed (7.5 s and 8.7 s). The new case against HEAD `run.ts` → failed as described above.
- `npx vitest run …/runtime/conversations …/runtime/flow-bootstrap/plan/tests` → 43 files, 448 tests passed.
- `npx vitest run …/runtime/service/project-build` → 14 files, 67 tests passed.
- Extra, to check for side effects of the larger code set: `npx vitest run` on `flow-bootstrap/{candidate,subflow-candidate,authoring,script-statements}` and `llm/harness-options` → 79 files, 765 tests passed.
- `npx tsc --noEmit -p tsconfig.json` → EXIT=0, no output.
- `node scripts/structure-audit.mjs` (Core root) → "structure-audit: passed (360 warning(s), 1156 baselined)". Two advisory warnings touch my files: `issue-feedback.ts` is now 473 lines and `execute.test.ts` 709 lines, both past the 400-line advisory threshold.

## Not verified

- No live run and nothing that could call a model provider, as the brief says.
- The Lab and downstream consumers of a draft's `trial.codes`. After this change, a timed-out project-build draft carries `project.build_time_limit` in place of the trial's own code (for example `candidate.trial_judged_no`). The original code is kept only in the run-local `feedback.trialCode`, not in the draft result. A Lab classifier that reads the draft's trial code would see the new code.
- A timed-out draft with no standing whole trial. The row is emitted, but promotion returns `codes: ["candidate.trial_not_run"]`, so create-here says "It was never test-run from the start…" without the time-limit opening. The draft result cannot carry the code without a trial, and the result and promotion files are outside this brief's files.
- `flow.explore` and `flow.improve` replies for a timed-out draft are unchanged. Only create-here was in scope.

## Open questions or contradictions found

- The debug report (fix 4) asked to say "which plan the kept draft belongs to". The candidate does not record the plan digest it was assembled under, and assembly may rename keys, so I did not guess it. The run.ts header says so.
- The `subflow.*` codes outside the submission path (`subflow.trial_*`, `subflow.ending_*`, `subflow.latest_proposal_required`, `subflow.execution_*`) are not in the walk. They are answers from other tools, raised with their own `instruction` or message text, not as `code:` issue literals.
- `flow_draft.*` codes (the draft/legacy path) are outside this walk. Several already get their sentence through `DRAFT_ROUTING_CODES` in `llm/`, which this brief did not let me touch.

## Correction (coordinator): the trial's own code stays first

Per the t590 decision, a draft's trial keeps its own code as its code. The time limit is carried beside it.

- `service/project-build/run.ts`: the kept draft's trial is returned with its `feedback.code` unchanged and with `feedback.endingCodes: ["project.build_time_limit"]` added. The earlier code swap and `trialCode` are removed, and the header comment is updated.
- `service/candidate-trial/promotion.ts`: this file was not on the brief's owned list. It is the only place the draft's `trial.codes` are built, and it is not on the must-not-touch list. Its `draft()` helper now appends the standing trial's `feedback.endingCodes` after the draft's own code. It keeps only identifier codes, at most 4, with no duplicates, so the draft's own code is always first. A t608 note is added to the header.
- `conversations/commands/create-here.ts`: still opens with the time limit when `trial.codes` includes `project.build_time_limit`. Only the comment changed.
- The chat row in `run.ts` already reads `outcome.timedOut` directly, so it needed no change.
- Tests:
  - The service test now asserts `trial.codes` equals `["candidate.trial_judged_no", "project.build_time_limit"]`: the trial's own code unchanged, with the time limit after it.
  - The create-here case in `execute.test.ts` uses the same two codes.

### Commands and results

- `npx vitest run` on `runtime/conversations`, `flow-bootstrap/plan/tests`, `service/project-build` and `service/candidate-trial` → 76 files, 668 tests passed.
- `npx tsc --noEmit -p tsconfig.json` → `TSC_EXIT=0`, no output.
- `node scripts/structure-audit.mjs` → "structure-audit: passed (360 warning(s), 1156 baselined)".

### Not verified

- There is no unit test of `endingCodes` in `promotion.test.ts`. Only the service-level test covers it.
- A timed-out draft with no standing trial still gets only `candidate.trial_not_run`, because there is no trial to carry `endingCodes`.
