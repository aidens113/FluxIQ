# t606 filter-group-guidance: worker report

## Outcome

Partial. Parts (1) and (3) are done and tested. Part (2) is **blocked**: the files I own cannot see what it needs.

## What changed and why

### (1) Generic builder guidance: the site's own filter, found by its group heading

- `runtime/llm/evidence-loop-decision.ts`. `AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION` is the system prose
  that every unstaged evidence loop gets, the candidate loop and the subflow builder included. One sentence is added
  right after "...never repeat a successful mutation merely to try another eventual-workflow value.":
  > When a condition the request asks for is not printed on the listed items, look for the site's own filter whose
  > group heading names that condition, and prefer choosing it over opening or reading every item to test it: in a
  > library catalogue, a request for audiobooks is met by the option Audiobook under the heading Format, a filter whose
  > words keep exactly what the request asks.

  A t606 paragraph was added to the doc comment.
- `runtime/flow-bootstrap/plan/flow-script-format.ts`. This is the script format shared by the candidate loop and the
  subflow builder, and its narrowing paragraph is where they are told how to narrow a collection. One sentence goes
  before "Otherwise read the collection and narrow in the read's own condition":
  > When the items do not print a condition the instruction asks for, look first for the site's own filter whose group
  > heading names it, such as Format: Audiobook in a library catalogue, rather than reading every item.

  A t606 note was added to the header comment.
- Pins:
  - `llm/deepseek/tests/system-prompt-pins.json`: only `evidence_tool_decision` changed, by exactly the sentence
    above plus its trailing space. The script built the change by inserting that text after the anchor, and the diff
    is one line. No other pin contains the instruction (`_staged` does not).
  - `plan/tests/flow-script-format.test.ts`: the legacy format and completion-schema sha256 digests are re-pinned,
    with a t606 comment, as t378 and t489 did:
    - format `71df264a...05ec67`
    - schema `02c76671...529147`
  - Byte ratchet, raised from 6,500 to 6,700 with a reason comment, following the t489 precedent. It is held in two
    places: `flow-bootstrap/tests/plan.test.ts` and `llm/tests/evidence-loop-provider.test.ts`. The completion schema
    measured 6,662 bytes with my first, longer wording. I shortened the sentence to about 212 bytes (estimate:
    6,402 + 212, about 6,614).
- Guard tests: all existing ones kept. New tests:
  - `authored-draft.test.ts`: the policy contains the sentence, and the sentence matches none of the store,
    seller, pickup or scenario words.
  - `flow-script-format.test.ts`: the narrowing describe asserts the sentence, that it comes before "Otherwise",
    and that it carries none of those words.

### (3) Issue messages

- `bootstrap.unknown_parameter`, in `plan/issue-feedback.ts`, which is where the message was dropped. The code is not
  in `AUTHORED_CODES`, so it reached the model with no `message`. Only the first issue per node got `accepted`.
  - Every such issue now carries Core's own sentence, for example: `The node web.output.dom-extract_list takes no
    parameter "screenshot". The parameters it takes are "extractList", "timeoutMs", "recordOutput",
    "expectedState": write the line under one of those, or move it to a step whose node takes it.`
  - Without a resolvable node, the sentence names the key and points to `core.describe_nodes`.
  - It inserts identifiers only: the key, gated by `DETAIL_NAME`, plus the node id and parameter ids. It inserts no
    values.
  - `accepted` is still given once per node.
  - Tests in `issue-feedback.test.ts`: the existing exact-shape test now includes the message. A new test covers two
    undeclared keys on one node (both messages, `accepted` once) and the case with no node.
- `flow_script.repeat_not_after_its_source`, in `authoring/draft-routing.ts`. This applies to the "inside another
  repeat" case, which is the one in the run: a span over a listing that a page loop runs.
  - The script format does **not** support a per-row loop over a paged list: a span holds no second repeat.
  - The message now says so and gives what does work. To keep rows across pages, use one `repeat while` span with
    `extractList.where`, plus a site filter set before that span for a condition the rows do not print. To act on
    each row, use `repeat over:` one listing. The text is the new constant `NO_ROW_LOOP_IN_PAGE_LOOP`.
  - I left the draft-path twin (`flow_draft.repeat_not_after_its_source`, "inside its own branch or loop") as it was,
    because that one can be a branch, not a loop.
  - Test in `candidate-loops.test.ts`: LANE_C plus a click step with `repeat over: page` is refused with the new
    sentence.

### (2) Supervisor sends the closest trial to a repair: BLOCKED

What I found:

- A repair's `failingReceipt` is chosen by the supervisor model from `compact().trials` in
  `supervisor/dispatch-tool.ts`. Each entry there is only `{kind, receiptId, digest}`
  (`contracts/receipt-ref.ts`, `contracts/builder-return.ts`).
- A subflow trial's verdict and its stored row count live only in two places:
  - `dispatch/run-brief.ts` (`TRIALS`, a module-private WeakMap holding `failingTrial(result)`);
  - `dispatch/receipts.ts`, where they are hashed into the digest and cannot be recovered.
- Neither the supervisor's context nor its ports (`supervisor/ports.ts`, `dispatch/port.ts`) expose them.
- So no code in `dispatch-tool.ts` or `state.ts` can tell an unsure 9-row trial from a no with 2 rows. In the run,
  the supervisor picked the latest trial because that was all it could tell apart.

What is needed, one of:

1. `dispatch/receipts.ts` records each trial's verdict and its stored-row count beside its ref. The builder return
   (`contracts/builder-return.ts`) carries them, for example as an optional `trialStandings` or a `closest` ref.
   `dispatch-tool.ts compact()` then prints each trial's verdict and rows, plus `closestToPassing`, ranked yes >
   unsure > no, then more rows. Optionally, `failingTrials` swaps a latest-but-worse subflow receipt for the closest
   one, or warns.
2. Or the dispatch port exposes a `trial(receiptId)` lookup that the supervisor can rank with.

Either way, the owned paths need widening to `project-agents/contracts/builder-return.ts` (and its parser test),
`project-agents/dispatch/receipts.ts` (or `run-brief.ts`), and their tests.

## Commands run and observed results

All commands were run in `C:/Users/osrs_/FluxStuff/fxwork/t606/!FluxIQ`.

- `npx vitest run` over `runtime/llm`, `runtime/project-agents`, `flow-bootstrap/candidate`,
  `flow-bootstrap/subflow-candidate`, `flow-bootstrap/plan`, `flow-bootstrap/authoring`, `flow-bootstrap/tests` and
  `runtime/tests/model-facing`, run from `packages/fluxiq`. Final result: `Test Files 318 passed (318)`,
  `Tests 3101 passed (3101)`, exit 0.
- Earlier runs failed, and each failure was fixed:
  - The format/schema digest pin. Re-pinned on purpose.
  - The provider byte ratchet, at 6662 against the 6500 limit. I shortened the sentence and raised the ratchet to
    6,700.
- `npx tsc --noEmit -p .` in `packages/fluxiq`: exit 0, no output.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (360 warning(s), 1156 baselined).` The changed files
  show only advisory size warnings, and those files were already past the thresholds.

## Not verified

- No live run and no model call were made, so it is not shown whether the new sentences change what a model does.
- The page view still drops `<legend>`, which is downstream fixes 1-2. Until that lands, a model cannot see a group
  heading, so (1) only pays off once the downstream view prints legends.
- Part (2) is not implemented.

## Open questions or contradictions found

- The brief puts (2) in `dispatch-tool.ts` or `state.ts`, but neither can see a subflow trial's verdict or rows (see
  above).
- The brief said the candidate loop's prompt pins move. The system-prompt pin moved by exactly the added text. The
  script format's change also moved the legacy format digests and the schema byte ratchet in
  `flow-bootstrap/tests/plan.test.ts` and `llm/tests/evidence-loop-provider.test.ts`. The brief did not list those
  files, but they test the guidance, so I updated them with reason comments. Revert the script-format sentence if
  only the system-prompt change is wanted.

## Follow-up: part (2) done (ownership widened by the coordinator)

Outcome: Done. Every part of t606 is now complete.

### What changed

- `project-agents/contracts/builder-return.ts`: new type `AutomationStudioProjectTrialRef`, which is a
  `ReceiptRef` plus optional `verdict` and `rows`.
  - `trials` is now a list of these. `readTrial` takes `verdict` and `rows` off the entry, reads the remaining
    `{kind, receiptId, digest}` with the existing strict `readAutomationStudioProjectReceiptRef`, then checks
    `verdict` against the trial verdicts and `rows` as a count. Any other extra key is still refused.
  - Returns written before this change, which lack the fields, still parse.
  - Three methods were added to the existing `automationStudioProjectBuilderReturn` object, so the export count does
    not change:
    - `closestTrial(returns)` ranks trials: unsure > no > not_judged > execution_failed. A trial with no verdict
      ranks lowest, and yes is never chosen. Within the same verdict, more rows wins. Among equals, the latest wins.
    - `trialAbove(a, b)`
    - `trialRef(trial)` returns the plain `{kind, receiptId, digest}`.
  - I first put this in a new `supervisor/closest-trial.ts`, but that pushed `supervisor/` to 26 files, past the
    audit's hard limit of 25, so it lives in the contract instead.
- `project-agents/dispatch/receipts.ts`: each listed ref now carries `verdict: result.verdict`, and also
  `rows: feedback.stored.rows` when that is a non-negative integer.
  - **How the digest rule is kept:** the digest is made exactly as before, with
    `automationStudioProjectDigest("project.subflow_trial_receipt.v1", {receiptId, identity, revision, digest, verdict,
    entryPrepared})`. `verdict` and `rows` only sit beside the reference. They are never part of its identity, and
    matching still uses `receiptId` plus `digest`.
- `project-agents/supervisor/dispatch-tool.ts`:
  - `compact()` still shows `trials` as plain refs, so they stay copyable whole. A brief's `failingReceipt` is read
    strictly, so a copied verdict would be refused.
  - It adds `trialsAnswered` (receiptId, verdict, rows), when any trial carries a verdict.
  - On a return that is not done, it adds `repairFrom: {failingReceipt, instruction}`, where `failingReceipt` is the
    closest trial across every return of that subflow. The instruction text is a constant in this file, because
    `guidance.ts` is not owned.
  - `failingTrials`: a repair that names a listed subflow trial ranked strictly below the closest one is sent with
    the closest one in its place. The brief's digest does not cover `failingReceipt`, and the swap happens before the
    brief is recorded. A trial that ranks equal is kept as named.
  - The refusals `failing_receipt_unknown` and `failing_receipt_passed` now also offer `closestTrial`.
- Tests:
  - `contracts/tests/builder-return.test.ts`: verdict and rows are read; a bad verdict, negative rows and an unknown
    key are each refused.
  - New `dispatch/tests/receipts.test.ts`: verdict and rows are carried; a trial with no stored rows lists none; the
    digest equals the old formula.
  - New `supervisor/tests/closest-trial.test.ts`: the ranking unit cases, including the towels run's five trials,
    which pick trial 3. An integration test on the real supervisor plus fixture checks that a partial return listing
    those five shows `repairFrom` trial-3 and `trialsAnswered`, that a repair naming trial-5 is dispatched with
    trial-3, and that a repair naming trial-2 keeps trial-2.
  - `supervisor/tests/supervisor-fixture.ts`: new optional `notDoneTrials`.
  - `dispatch/tests/repair-opening.test.ts`: now copies only `{kind, receiptId, digest}` into `failingReceipt`. It
    used to copy the whole listed ref, which the strict brief reader now refuses because the ref carries `verdict`.

### Commands run and observed results

- `npx vitest run` over `runtime/project-agents` and `runtime/service/project-build`: `Test Files 48 passed (48)`,
  `Tests 325 passed (325)`, exit 0. The first run failed only `repair-opening.test.ts`, with
  `project.unknown_field at brief.failingReceipt.verdict`; fixed as described above.
- `npx tsc --noEmit -p .`: exit 0.
- `node scripts/structure-audit.mjs`: `passed (360 warning(s), 1156 baselined)`. `supervisor/` is at 25 files, which
  is an advisory warning only.
- `flow-bootstrap/plan/issue-feedback.ts` was not touched after the coordinator's note (t608).

### Not verified

- No live run. Live builders have not yet produced trials carrying these fields, so `rows` depends on the subflow
  trial feedback keeping `stored.rows`. That was read in source (`service/candidate-trial/feedback.ts`), not
  observed in a live return.
- The supervisor's guidance (`guidance.ts`, not owned) does not mention `repairFrom` or `trialsAnswered`. Only the
  inline instruction on `repairFrom` explains them.
