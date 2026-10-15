# t630 plan-keeps-shaping-with-read: worker report

Core worktree `C:/Users/osrs_/FluxStuff/fxwork/t630/!FluxIQ`, branch `task/t630-plan-keeps-shaping-with-read`. Nothing committed.
Source: debug `a8-everything-store-run-mv9dd0fk-second-subflow.md` (A8 wave 7, `run-mv9dd0fk-8cd2e522`).

## Outcome

**Partial.** All three fixes are built in the files I own, and their tests pass. Two pieces need a file outside my
ownership before they work in a live build, so the supervisor has to make those edits (exact text below):

1. **`supervisor/plan-tool.ts` `warningText`** gives every warning code except `project.plan_subflow_constraint` the
   `valueUnused` words. Until it reads `GUIDANCE.planIssues`, the new `project.plan_subflow_reshape_only` warning reaches
   the supervisor with the wrong words ("Keep it only if it is what the Flow hands back ...").
2. **Nothing in a project build produces the issue codes that fix 2 reads.** The builder's stop carries only
   `llm_evidence_loop.repeat_refused`. The scope refusal's issues (`subflow.input_unread`) are only in the tool's evidence,
   and the trace row's `subflow.scope_refused:<digest>` is a one-way FNV digest. Candidate builds already carry them as
   `candidate.last_submission_*` codes (`service/flow-bootstrap-commands/candidate-generation.ts`). The project
   builder path (`service/project-build/brief-ports.ts`) does not. `ending.ts` now reads those codes. Until a producer
   writes them, a live blocked return still reads `subflow.scope_refused:b54daa6d`, exactly as before.

## What changed and why

### Fix 1: the plan keeps shaping with the read (`supervisor/plan-input.ts`, `supervisor/guidance.ts`)

- `valueWarnings` adds `project.plan_subflow_reshape_only` (a warning, path `subflows.<at>`). It fires on a subflow of a
  plan with several subflows that meets all of these:
  - it takes an input that another subflow outputs (a Flow parameter such as a search name does not count);
  - none of its parts has a lasting act;
  - it has outputs, and no other subflow takes any of them.

  A subflow with no outputs still gets `project.plan_subflow_constraint` as before, so the two warnings never land on
  the same subflow.
- `project.plan_value_unused` no longer fires on the outputs of the subflow that hands back the Flow's answer
  (`handsBackTheAnswer`). That is a plan's only subflow, or a subflow that runs after another (through `after` or by
  taking its value) while nothing runs after it or takes its value. Two subflows with no order between them are still
  warned, so the "order it with after instead" advice keeps its case.
- Guidance:
  - step 2 of `HOW_TO_WORK` gains "A part that only narrows, de-duplicates, orders or shapes what another part reads is
    carried by the subflow that reads it.";
  - the warnings line in `WRITE_PLAN` names the new warning;
  - `planIssues["project.plan_subflow_reshape_only"]` holds the debug's words: carry the parts in the subflow that
    reads, unless its builder must open or read something on the target for each row.
- No supervisor prompt pin exists in the tests I could find. I grepped for the step-2 sentence, `howToWork` and the
  guidance strings across `src`. No pin moved, and no pin was re-pinned.

### Fix 2: a blocked return names the refused submission's issues (`dispatch/ending.ts`)

- `stoppedOn(brief, codes, rows)` replaces `guardSaid + callsSaid` on both stop paths: a returned loop's
  `exhaustion.lastIssueCodes` with its trace, and a thrown build failure's `issueCodes` with its `evidenceLoop.steps`.
  It decodes `candidate.last_submission_*` with Core's shared table, `automationStudioCandidateRefusalCodes`
  (`service/candidate-failure`). Where the codes carry a family and issue codes, it:
  - says the latest run of that family's digested code as its family and issue codes, for example
    `core.submit_subflow answered subflow.scope_refused (subflow.input_unread: input "packet") (3 in a row)`;
  - names the input by the brief interface's port ids, which are Core-checked plan names;
  - takes the carried codes out of the "It was stopped by" sentence;
  - ends the reason with the plan-level advice when `subflow.input_unread` is among the issues: "The plan gives this
    subflow a value no step of it reads: change the plan with project.amend_plan, so that it takes only values a step of
    it types or opens, or carry its parts in the subflow that reads that value."

  With no carried codes the reason is unchanged, including the digest.

### Fix 3: refusal words (`supervisor/dispatch-tool.ts`, `supervisor/guidance.ts`)

- `GUIDANCE.briefIssues["project.brief_failing_receipt"]`: "Only a repair names failingReceipt, and a repair must name
  one: ... With neither to name, send kind build with something it is given changed, or change the plan with
  project.amend_plan."
  - `worded()` attaches it as `why` to brief-reading issues (line ~111) and to the build record's refusal (line ~132).
  - **Correction to the debug:** the live refusal at 0053 (`path: briefs.0.failingReceipt`) came from the brief's
    reading (`brief-input.ts` parse, path rewritten to `briefs.N`), not from the record catch the debug named. Both
    paths now carry the words.
- `GUIDANCE.issues.failingNone`: when `project.failing_receipt_unknown` fires, no return of the subflow lists a trial,
  and no whole test stands that did not pass, the `why` says "there is nothing to repair from: send kind build with
  something it is given changed, or change the plan". The code stays `project.failing_receipt_unknown`. If any return
  lists a trial, the old `failingUnknown` words stay.

### Tests

- `supervisor/tests/plan-input.test.ts`, 4 new tests:
  - a reshape-only subflow warns, and the first subflow taking a Flow value does not;
  - a subflow with a lasting act does not warn;
  - a subflow whose output a later one takes does not warn;
  - the only subflow's output and the last subflow's output are never "unused", while two unordered subflows still are.
- `supervisor/tests/repair-repeats.test.ts`, 2 new tests:
  - a blocked subflow with no trials is answered `failingNone`, with no `wholeTest`;
  - a repair with no receipt carries the `briefIssues` words at `briefs.0.failingReceipt`;
  - `failingUnknown` is kept when a return lists a trial.
- `dispatch/tests/brief-return-reason.test.ts`, 1 new test: a thrown repeat-without-progress failure whose codes carry
  `subflow.scope_refused` / `subflow.input_unread` says `input "packet"`, drops the digest and the raw codes, and gives
  the advice; with no carried codes the old text and digest stay and no advice is given.

## Commands run and observed results

- `./node_modules/.bin/vitest run` on plan-input, repair-repeats, guidance and brief-return-reason, first run: 1 failed
  (the record-path assumption above), 50 passed. Fixed by wording brief-reading issues too.
- `./node_modules/.bin/vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build`
  (from `packages/fluxiq`) printed `Test Files 52 passed (52)` and `Tests 369 passed (369)`. The guidance guard test
  (`names none of the ten realistic scenarios ...`) is among them and passed.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` (packages/fluxiq): `tsc exit 0`.
- `node scripts/structure-audit.mjs` (Core root): `structure-audit: passed (368 warning(s), 1156 baselined).`, exit
  0. No warning names a changed file.

## Not verified

- No live or Lab run, as the brief said.
- The supervisor-facing words of the new plan warning: `plan-tool.ts` still maps it to `valueUnused` (gap 1).
- Fix 2 end to end: no project-build producer writes `candidate.last_submission_*` (gap 2). The test feeds codes
  through the shared encoder.
- The record-catch path of `worded()` (the `AutomationStudioProjectRecordRefusal` catch) has no test of its own. The
  brief-reading path is tested; both use the same function.
- The false-positive rate of `plan_subflow_reshape_only` on other scenarios' plans.

## Open questions or contradictions found

Edits needed outside my ownership:

1. `supervisor/plan-tool.ts`, replace `warningText` with:
   ```ts
   function warningText(code: string): string {
     const words: Readonly<Record<string, string>> = GUIDANCE.planIssues;
     if (Object.hasOwn(words, code)) return words[code]!;
     return code === "project.plan_subflow_constraint" ? GUIDANCE.warnings.constraintSubflow : GUIDANCE.warnings.valueUnused;
   }
   ```
   Add a test in `supervisor-loop.test.ts` or `plan-dispatch.test.ts` that a written reshape-only plan's warning has
   `instruction: GUIDANCE.planIssues["project.plan_subflow_reshape_only"]`.
2. Producer for fix 2:
   - `service/candidate-failure/submission-refusals.ts`: make the watched tool id a parameter, defaulting to
     `core.submit_candidate`.
   - `service/project-build/brief-ports.ts`: per brief (in `environment`), create
     `automationStudioCandidateSubmissionRefusals("core.submit_subflow")`.
   - Wrap the builder loop with its `observe`, composed with the existing `observe` at line ~245. That hook wraps the
     builder's `discovery` input, submit tool included (`flow-bootstrap/subflow-candidate/builder-loop.ts:327`).
   - Make `stalled` (line ~186) pass `{ ...progress, issueCodes: [...refused, ...progress.issueCodes] }`, where
     `refused = submissions.codes(progress)` when the stall code is `flow_bootstrap.evidence_repeat_without_progress`,
     as `candidate-generation.ts:115-117` does.
   - Once that lands, a blocked return reads as in the new ending test.
3. The ending decodes `service/candidate-failure` from `project-agents/dispatch`, a value import from service into
   project-agents. It is the shared producer and reader table, so I did not copy it. The audit passed, and
   `project-agents/record` already imports service paths, but only as types. Moving `refusal-codes.ts` below both
   layers would be cleaner if the supervisor prefers.

## Follow-up: both gaps closed

**Outcome: Done.** Two things the coordinator should know first:

- **Core `dev` is not merged into this branch.** Worker rules forbid history-changing git commands. The branch HEAD is
  `88a3565d`, and `dev` is ahead by t629 alone (`result-verification`), which touches none of these files.
- **Ownership:** besides the files the coordinator granted, I added one test to `supervisor/tests/plan-dispatch.test.ts`,
  which I took to be among plan-tool's tests.

### What changed

**Gap 1: every plan warning carries its own words.**

- `supervisor/guidance.ts`: the `warnings` object is gone. Its two texts now live in `planIssues` under their own codes
  (`project.plan_value_unused`, `project.plan_subflow_constraint`), beside `project.plan_subflow_reshape_only`.
- `supervisor/plan-tool.ts`: `warningText` is replaced by `warned()`. It answers each warning with
  `instruction: GUIDANCE.planIssues[code]`, so no code can borrow another's words. Nothing else read
  `GUIDANCE.warnings` (grep of `src`).

**Gap 2: the project build writes the refusal codes.**

- `service/candidate-failure/submission-refusals.ts`: `automationStudioCandidateSubmissionRefusals(submitToolId = "core.submit_candidate")`.
  It watches the tool its caller names; candidate builds are unchanged.
- `service/project-build/brief-ports.ts`: each brief's `environment` creates a watcher for `core.submit_subflow`.
  - The builder loop's `observe` wraps it, and that hook wraps the builder's own submit tool.
  - `stalled` adds `submissions.codes(progress)` ahead of the loop's codes for
    `flow_bootstrap.evidence_repeat_without_progress`, as `candidate-generation.ts` does.
  - A reset brief uses the same `environment` and never submits, so it carries no extra codes.
  - The header has a t630 section.

### Tests added

- `supervisor/tests/plan-dispatch.test.ts`, "a written plan's warnings": one plan that raises all three warnings, through
  the real supervisor loop. Each answered `instruction` equals `GUIDANCE.planIssues[code]`, and the three are distinct.
- `service/candidate-failure/tests/submission-refusals.test.ts`: a watcher for `core.submit_subflow` ignores
  `core.submit_candidate`. It records a scope refusal as family `subflow.scope_refused` with issue
  `subflow.input_unread`, and it counts sent-again rows of its own tool.
- `service/project-build/tests/project-build-brief-ports.test.ts`, "a brief whose builder never reads the input the
  plan gives it". This runs through the real service and brief ports:
  - the plan is one callable subflow with `inputs: ["titles"]`, and the builder submits three slightly different
    scripts that declare `input: titles` and never read it;
  - each submission is refused `subflow.input_unread`;
  - the supervisor's dispatch answer comes back blocked with
    `core.submit_subflow answered subflow.scope_refused (subflow.input_unread: input "titles") (3 in a row)` and the
    `project.amend_plan` advice, with no digest and no `candidate.last_submission` codes in the reason.
  - The helper now also keeps the supervisor's latest evidence, under `(supervisor)`.

### Commands run and observed results

- Negative check:
  - I temporarily replaced `built.submissions.observe(observed)` with `observed` in brief-ports and ran the new test.
  - It failed, and the received reason was the live text exactly: `... The calls it stopped on, latest first:
    core.submit_subflow answered subflow.scope_refused:b54daa6d (3 in a row).`
  - The file was restored from a copy (`grep -c built.submissions.observe` gave 1), and the test passes again.
- `./node_modules/.bin/vitest run src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build src/programs/automation-studio/runtime/service/candidate-failure`
  printed `Test Files 53 passed (53)` and `Tests 375 passed (375)`.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json`: `tsc exit 0`.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (368 warning(s), 1156 baselined).`, exit 0.
  - The only warning on a changed file is the advisory `file-lines` one for `brief-ports.ts` (463 lines).
  - The warning count is the same as before this follow-up.

### Still not verified

- No live or Lab run.
- The returned-loop stop path: a builder loop that returns without throwing gets no producer codes, because
  `exhaustion.lastIssueCodes` is untouched. Live project builders throw, as this run and the new test show, and
  `ending.ts` reads both paths.
- The false-positive rate of the reshape warning on other scenarios.
