# t652: split labelled, kept conditions from any judged trial, filters recorded

Worker report. Brief: fixes 1, 2 and 3 of the debug
`!FluxIQWebExtension/docs/working/automation-project-agents-plan/reports/a8-towels-run-mva6mlo8-debug.md`
(section "Proposed structural fixes"). Branch `task/t652-split-labelled-and-filters-recorded`.
No commits.

## Outcome

**Partial.**

- **Fix 1: Done.** A split's no is now labelled where Core's record refutes any of it.
  The gate and refusal words for `"part"` no longer say nothing contradicts it.
- **Fix 2: Done inside the owned paths.** Two one-line edits in `service/**` are still
  needed before it acts in a live build. The brief does not let me edit those files.
  See "Open questions".
- **Fix 3: Stopped,** as the brief directs. The page view Core holds does not carry a
  group's options and counts as data. The section "Fix 3" says exactly what the
  domain would need to send, and where.

No judge pin moved. No prompt changed.

## What changed and why

### Fix 1: label a split's no where Core's record refutes part of it

- `result-verification/agreement.ts`:
  - Both `model_disagreed` branches (yes then no, and no or other then yes) now pass
    `refuted: splitRefuted(input, call)` into `unsettled(…)`. The neither-yes-nor-two-nos
    branch already did this, and it now uses the same helper.
  - The no's reading gets the t628 label: "Core's record contradicts part of this
    reading: …", or "contradicted …" where all of it is refuted. It also gets
    `recordContradicts: "part" | "whole"`.
  - The verdict, `refutedMark` and the t607 re-ask are unchanged.
  - A header note (t652) was added.
- `flow-bootstrap/candidate/trial-gate.ts`:
  - New export `automationStudioCandidateRecordContradictsPart(answer)`, which reads
    the field, never the words.
  - New words `UNSURE_PART_CONTRADICTED`: "Core's record contradicts part of the no's
    reading, as its label in unconfirmedReading says (retestAdvised is false): make no
    change for that part. Change the Flow only for what the rest of it names where the
    trial's own reads, steps and stored rows show it, …", plus the existing "stays
    allowed" retest line.
  - Order of precedence: advised (`whole`, or a contradicted doubt) first, then `part`,
    then the old `UNSURE_RETESTABLE`.
  - `retestAdvised` is unchanged: `true` only for `"whole"` or a contradicted doubt
    (t641).
- `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`: the same third set of
  words, in subflow wording with `core.submit_subflow`. A header note was added.
- `flow-bootstrap/candidate/unchanged-submission.ts`:
  - `Retest` gains `part`.
  - `retestWords` has a third branch. Where the standing revision's unsure has
    `"part"`, it says Core's record contradicts part of the no's reading, to make no
    change for that part, and to change the Flow or subflow only for what the rest
    names.
  - `standingRevision.retestAdvised` stays `false` for `part`.

### Fix 2: keep a vindicated condition from any judged trial

- `result-verification/agreement.ts`:
  - New `recorded(input, outcome)` adds `standingNo` (`standingNoOf(input)`) to every
    outcome that two calls of a build test reach and that lacks it: a split, an unsure,
    a held yes, and two yeses.
  - It is applied at both exported boundaries: `automationStudioResultVerificationAgreement`,
    and `automationStudioResultVerificationReaskContradicted`, whose body moved into a
    private `reaskContradicted`.
  - This means the outcomes that `refuted-no/reask.ts` builds keep it too.
  - The double-no branch still builds its own record from its own calls.
  - A runtime check and a one-call outcome get nothing, because `standingNoOf` needs
    `confirmAnswer` and `second`.
- `result-verification/build-test/judge.ts`:
  - The `unknown` verdict now carries `standingNo` (a structured clone), declared on its
    type. The header was updated.
  - A model never sees it: `service/candidate-trial/feedback.ts` and
    `unfinished-build/judgement.ts` pick fields one by one.
- What is kept is unchanged:
  - `standing-no-record/record.ts` `keptOutOf`: every row a condition left out by
    itself is accounted for by `also_in_result` or by the request's words.
  - A label test is never accounted for, because `record.ts` `requestQuotes` skips
    `testsLabel` conditions (t651).
  - `standing-no/memory.ts` `weigh` acts only on `verdict === "no"`, so an unsure's
    `standing` calls are never weighed as a no.
  - The subflow gate's `port.weighed` still passes `standingNo` only for a no
    (`stood`).
- Comments updated in `standing-no/types.ts` (the carrier) and
  `standing-no/kept-conditions.ts` (header).
- The gates already call `keptConditions.remember` for any verdict, and the
  submission controllers read `keptConditions` whatever the verdict. Neither needed a
  change.

### Fix 3: stopped (see "Open questions")

No source change for fix 3.

### Tests

- New `result-verification/refuted-no/tests/split-partly-refuted-route.test.ts`. This
  is the debug's `agreement-split-partial.test.ts`, moved because
  `result-verification/tests/` would have reached 26 files, past the 25-file limit. It
  sits beside `partly-refuted-route.test.ts`.
  - It runs on the library fixture through the build-test judge.
  - A split whose no says "Missing qualifying items include <a stored title>", plus a
    doubt Core cannot settle, is labelled with `recordContradicts: "part"`. This holds
    with yes first (call 2 labelled) and with no first (call 1 labelled).
  - A split no that names nothing Core can check stays unlabelled, either way round.
  - The verdict is `unknown` (unsure) every time, after exactly 2 calls.
  - The debug's own fixture idea, a no of "missing <stored row>" plus only "verify the
    filter steps", is **wholly** refuted in practice. It gets the t607 re-ask (3 calls,
    `whole`), so the fixture adds a standing doubt instead.
- New `flow-bootstrap/candidate/tests/kept-condition/tests/kept-condition-after-split.test.ts`.
  - It runs on the hardware fixture, through the build-test judge (yes, then no), the
    candidate trial gate and the submission controller.
  - The unsure trial keeps condition 1, `delivery … contains ["Delivery tomorrow"]`. It
    left out only `DRILL_SLOW`, read as "Delivery in 6 days": `keptOut` is
    `request_words`.
  - The label-tested seller condition is not kept.
  - The next revision dropping condition 1 is refused with
    `candidate.kept_condition_dropped` and `feedback.resend: "accepted_once"`. The
    identical resend is accepted as revision 3.
  - Dropping the seller condition is never refused.
  - The port answers an unknown as the service would after the change described in
    "Open questions".
- Added to existing tests:
  - `candidate/tests/trial-gate-unsure.test.ts`: a `"part"` unsure never prints
    "Nothing in Core's record contradicts", says the part words, and has
    `retestAdvised: false`. The completion refusal carries the same words.
  - `subflow-candidate/tests/subflow-trial-unsure.test.ts`: the same, in subflow words.
  - `subflow-candidate/tests/unchanged-after-no-words.test.ts`: the refusal's offer for
    a `"part"` unsure has the part words and never "Nothing in Core's record contradicts".
- **Moved** (structure audit, `directory-files`):
  - `candidate/tests/` had 26 files, so the three `kept-condition-*` files now sit in
    `candidate/tests/kept-condition/tests/`. This follows the shared-prefix rule and the
    `executor/tests/<feature>/tests/` pattern.
  - The three are `kept-condition-drop.test.ts`, `kept-condition-fixture.ts` and the new
    test.
  - Imports and comment paths were deepened.
  - `subflow-candidate/tests/kept-condition-drop.test.ts` now imports the fixture from
    its new path.
  - Plain `mv`, nothing staged.
- `agreement.ts` reached 809 lines against the 800-line limit. My own header and doc
  comment were shortened, giving 796 lines. Nothing was extracted.

## Commands run and observed results

All from `C:/Users/osrs_/FluxStuff/fxwork/t652/!FluxIQ/packages/fluxiq` unless noted.

- Baseline before any new test:
  `npx vitest run …/result-verification …/flow-bootstrap/candidate …/flow-bootstrap/subflow-candidate`
  gave `Test Files 124 passed (124)`, `Tests 1054 passed (1054)`.
- The new split test against the original `agreement.ts` (`git show HEAD:` copied in,
  then restored):
  - It printed `2 failed | 1 passed`.
  - With the fix it printed `3 passed`.
- The new kept-condition test against the original `agreement.ts` and `judge.ts`
  (restored after):
  - It printed `1 failed | 1 passed`, with `expected undefined to deeply equal [ Array(1) ]`.
  - With the fix it printed `2 passed`.
- Final vitest, the four directories the brief names:
  `npx vitest run …/result-verification …/flow-bootstrap …/service/candidate-trial …/service/subflow-trial`
  gave `Test Files 290 passed | 1 skipped (291)` and
  `Tests 3191 passed | 2 skipped (3193)`.
- `npx tsc --noEmit -p tsconfig.json` exited 0 with no output. An earlier run had
  flagged a `JsonObject` cast in the new test, which was fixed and rerun.
- `node scripts/structure-audit.mjs`, from the Core root:
  - It printed `structure-audit: passed (382 warning(s), 1156 baselined).`
  - The earlier run printed 3 violations: two directories at 26 files, and
    `agreement.ts` at 809 lines. All three were fixed as described above.
  - No baseline was regenerated.
- No live run.

## Not verified

- Fix 2 end to end, through the real candidate and subflow trial services. They still
  drop an unknown's `standingNo` (see "Open questions"). The new test stands in for the
  service with a port.
- A subflow-gate replay of fix 2. Only the whole-candidate gate has a test. The subflow
  gate's `remember` call is verdict-agnostic and was not changed.
- Whether fixes 1 and 2 would have saved `run-mva6mlo8-f519063c`. That depends on the
  builder's response, which cannot be replayed.
- `project-agents/**`, which the brief told me not to touch. The supervisor's
  dispatcher seeds `standingNos` only from nos (`stood`), so it is unaffected.

## Open questions or contradictions found

1. **Fix 2 needs two lines in `service/**`, outside my owned paths.** Both trial
   services hand the gate `standingNo` only on a no:
   - `service/candidate-trial/run.ts:154` and `service/subflow-trial/run.ts:177`
     currently read:
     `const standingNo = read.verdict === "no" && verdict.verdict === "no" ? verdict.standingNo : undefined;`
   - Each should become:
     `const standingNo = (read.verdict === "no" && verdict.verdict === "no") || (read.verdict === "unsure" && verdict.verdict === "unknown") ? verdict.standingNo : undefined;`
   - The header comments ("A no keeps Core's record of it (t633)") should say "or an
     unsure (t652)".
   - Neither change affects what a model sees: `answer()` and `answerFor()` put
     `standingNo` beside the feedback.
   - The subflow gate's `port.weighed` and the project dispatcher still keep only a
     no's record, through `stood`.
   - Until this lands, fix 2 is inert in live builds.
2. **Fix 3: the page view Core holds does not carry a group's options and counts as
   data.**
   - In the trial trace, the snapshot Core holds before each step is
     `stateRefs.beforeAction.summary`, with `afterAction` after it.
   - The domain builds it in `domain/src/runtime/host-runtime.ts` (about line 206) as
     `publishedWebLlmPage(packet)` (`domain/src/runtime/llm-evidence/page-view/published-page.ts`).
   - That object's only page content is `page`, the `web-llm-page.v3` text.
   - `group="…"` exists only as a token inside that text's control lines
     (`page-view/line/render.ts`, `page-view/element/group-token.ts`).
   - An option's count exists only inside its words, for example
     `checkbox "Hardcover (40)" … group="Format"`.
   - Reading either means parsing the domain's line grammar. That is against
     `narrowed-before.ts`'s own rule ("interprets none of its lines") and the domain's
     declaration that Core knows nothing about pages.
   - **What the domain would need to send, and where:** on each snapshot `summary` in
     `host-runtime.ts`, beside `page`, a structured field. For example:
     `groups: [{ name: "<group words>", options: [{ words: "<option words>", count?: <number the page shows>, chosen: boolean }] }]`,
     and `resultCount?: <number the page states>`.
     - These are numbers and words the domain read off the page, already sanitised as
       `page` is (the `sanitizeWebLlmSnapshot` path).
   - Core's side would then be:
     - `narrowed-before.ts` reads them for each narrowing step: the group whose chosen
       option matches the step's control words, plus the `resultCount` before and after.
     - `contracts/read-account.ts` `AutomationStudioResultNarrowingStep` gains `group`,
       `leftOptions: [{ words, count? }]` and `resultCount: { before?, after? }`.
     - `agreement.ts` `contradictedUnsure` gains `about: "narrowing"` for an unsure whose
       doubt names such a step as an option the request does not name, where its control
       words pass `refuted-no/request-text-test.ts`. That call is re-asked once (t503),
       and its answer replaces it.
   - This crosses into the domain, so the domain side was not started.
3. **The debug's fix-1 fixture would be wholly refuted.** A no of only "missing
   <stored row>" plus "verify the filter steps" is wholly refuted by today's
   `weigh.ts`: the verify sentence does not stand. The debug had inferred the opposite
   for trial 6 ("Not verified"). With `whole`, fix 1 now also labels such a split's
   reading "contradicted" and advises a retest, while the t607 re-ask runs as before.
4. **The coordinator's ownership change was respected.** `refuted-no/types.ts` and
   `refuted-no/record.ts` were not edited, and no fix needed them.
