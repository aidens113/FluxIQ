# t607 refuted-no-recheck: worker report

## Outcome

Done. Core now weighs each judge "no" against its own record of the result before taking it. If Core's record refutes every reason a no gives, that call is asked once more, with Core's findings stated as Core's measurement. Each refuted call gets one re-ask, so a double no can mean two re-asks.

- If the re-ask comes back yes, its yes is used.
- If it says no again on refuted grounds, or never comes back usable, that no is not taken. The verdict becomes `unsure` (`core.result.refutation_contradicted`), never `no`.
- Core never turns a no into a yes.

Two kinds of no stand exactly as before: one that names nothing Core can check, and one that makes any claim Core cannot refute. The rule sits in the agreement and re-ask path that `verifyAutomationStudioRunResult` uses. The build-test judge goes through that path, so candidate, subflow and whole trials all get the rule, and so does the runtime result check.

## What changed and why

New directory `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/refuted-no/` (barrel `index.ts`):

- `record.ts`: Core's record of the judged summary. It holds the stored rows by column, each left-out row with its condition and whether Core settled it, the stored count, the rows the answer's dedupe removed, the node ids, and the item phrase from the request.
- `sentences.ts`, `named-rows.ts`: split a no's `observed` into sentences, and find the rows each sentence names. A row is found by id, by Core's short id, or by a label prefix with a value check, the same rules as `checked-rows.ts`. A quote or id that matches no row Core holds is flagged `unmatched`.
- Claim checks, each refuted only from Core's record:
  - `duplicate-claim.ts`: rows called "the same", duplicates, or "share the name" are refuted when every named stored pair differs in its label and another column, and no stored row repeats one cell for cell. The finding names the differing columns and the dedupe's removed count.
  - `missing-claim.ts`: rows called missing or absent are refuted when each is stored, or was left out alone by a condition Core settled. This does not apply when the sentence disputes a condition, filter or bound itself.
  - `excluded-kind-claim.ts`: a stored row called an excluded accessory is refuted when its label names the item first and the excluded phrase only after it. This is the same reading as `left-out-naming-the-item.ts`. See the open questions.
  - `count-claim.ts`: "only N rows" or "N rows were stored" is refuted when N differs from Core's stored count.
  - Claims about pages (t501) and order (t511) are checked by `agreement.ts` through `record.other`.
- `weigh.ts`: a sentence that makes claims is refuted when every one of its claims is refuted. A sentence with no claims still stands as a reason when it says something is wrong about something Core can name: a row, `condition N`, a node id, or an unmatched quote or id. Otherwise it is neutral. A reading is wholly refuted when at least one sentence is refuted and none stands. Only `observed` is read: `expected` restates the request, and the advice rests on what was observed.
- `recheck-words.ts`: the re-ask text. It gives "Core's record: …" and then asks to "Answer again from the evidence…". It never asks for a yes.
- `reask.ts`: re-asks each marked call once and works out the outcome, as described under Outcome.

Edits to existing files:

- `agreement.ts`:
  - New optional `summary` and `requestText` on the agreement input. Without them nothing is weighed.
  - On a double no or a split, a wholly refuted no is marked `refutedNo`, and its reading is labelled "contradicted by Core's record: …".
  - `ReaskContradicted` runs the new re-ask after the t503 check and before t515's.
  - The header has a new t607 paragraph.
- `verify.ts`: passes `summary` and `requestText` (instruction titles and bodies, as `request-wording.ts` builds them).
- `contracts.ts`: new field `refutedNo`, and the `verdicts`/`calls` docs now cover 4 calls. The file is exactly at the 800-line limit.
- `verdict.ts`: new code `refutationContradicted`.
- `request-rows/index.ts`: now exports `row-values.ts`. The audit refused a direct reach into that file.
- `build-test/judge.ts`: the header verdict table has the new row.
- `build-test/tests/judge.test.ts`: the t501 test "two noes, one claiming pages the record says do not exist" is replaced by two tests. Under the new rule its pages-only no is re-asked:
  - The re-ask names a standing defect: the verdict is no (3 calls).
  - The re-ask repeats the pages claim: the verdict is unknown, the standing reading is unconfirmed, and `why` says Core's record contradicts it.
- New tests in `refuted-no/tests/`:
  - `weigh.test.ts` (10 tests): each claim check.
  - `reask.test.ts` (9 tests), on the debug's shape:
    - The double no is marked and re-asked; two yeses on the re-ask give a yes.
    - The same no repeated gives unsure, which does not fail the run.
    - A re-ask yes beside a no that is still refuted gives a split (unsure). An unusable re-ask is not taken either.
    - A re-ask that names a real defect gives a no.
    - On a split, the refuted no is re-asked and its yes completes the pass.
    - A real-defect double no stands and nothing is re-asked; so does a vague double no.
    - Without the summary, the result is unchanged.
  - `judge-route.test.ts` (6 tests): the build-test judge with a scripted provider, run as a candidate trial and as a subflow trial (with a task checklist):
    - Re-asks yield yes, and the re-ask requests carry Core's record.
    - Repeated nos yield unknown, never no.
    - A real-defect no stands after exactly 2 calls.
  - The fixture `lamps-fixture.ts` is a desk-lamp shop with no realistic-scenario content. These tests live here because `result-verification/tests/` is at the 25-file limit.

## Commands run and observed results

- `npx tsc --noEmit -p .` (in `packages/fluxiq`): exit 0, no output.
- `npx vitest run …/result-verification …/service/candidate-trial …/service/subflow-trial …/service/project-build`: 106 files, 896 tests passed.
  - The baseline before my changes had 1 failure in `project-build/tests/project-build-time-limit.test.ts`. It was a timing-dependent note text and passed on the later run, so it looks flaky.
- After the final edit, `npx vitest run …/result-verification …/candidate-trial …/subflow-trial`: 92 files, 830 tests passed.
- `npx vitest run …/recovery …/flow-bootstrap/unfinished-build …/service/runtime-adaptation …/service/flow-bootstrap-commands …/result-check-schedule …/llm/node-tools …/service/end-view`: 145 files, 1473 tests passed.
- `node scripts/structure-audit.mjs` (Core worktree root): "structure-audit: passed (361 warning(s), 1156 baselined)".
  - Warnings that concern my files: `agreement.ts` is 571 lines (it was already past the 400-line advisory at 481), and `lamps-fixture.ts` exports 12 values.
- Offline replay against the real run `lab-runs/2026-10-14/run-mv8p0p7c-c8412344`, every no or unknown judge call. It used a scratch test that has been deleted and is not in the tree. It ran Core's own functions on the recorded request summaries and replies, and no provider was called.
  - 0050 and 0051 (the wrong double no): wholly refuted.
  - 0026, 0027, 0032, 0033, 0075, 0076, 0116, 0117, 0126, 0127 and 0181 (all correct nos): all still stand.
  - 0046 (wrong): still stands, because one row it names, "Tessaro Arc Lite …", is in no condition's alone-list. That row failed two conditions, so Core's record cannot refute it. This is honest, and it was a split, so it ended unsure anyway.
  - 0081 (unknown): not in scope (see below).
  - Feeding 0050 and 0051 through the agreement and the re-ask gave:
    - Re-asks answered with the recorded 0047 yes: `answers`, 4 calls.
    - Re-asks answered with the same nos: `unsure`, `model_unconfirmed`, `core.result.refutation_contradicted`, which does not fail the run.

## Not verified

- No live run and no model call (forbidden by the brief). Whether real judges change their answer when shown Core's findings is not measured.
- I did not run `pnpm check`, the full fluxiq suite, or the downstream repository.
- The judge deadline (`deadline.ts`) still budgets 4 call slots. A double no with both calls re-asked uses 4 calls on the normal path. If temporary faults force extra asks, the deadline could cut the judgement to `not_judged`. I did not change it.

## Open questions or contradictions found

1. **The t501 behaviour changed, deliberately.** Take a double no where one call's every reason is refuted (for example a pages-only claim) and the other names a real defect. That call is now re-asked. If it repeats the refuted claim, only one standing no is left, so the outcome is unknown (unsure) rather than no. Before, it was a refutation that carried both readings. This follows the brief literally ("a no whose every named reason… is not taken"). If the supervisor prefers to re-ask only when no standing no is beside it, the change is one line in `refutedMark` (`agreement.ts`): skip the mark when the other call is a no that is not wholly refuted.
2. **`excluded-kind-claim.ts` goes beyond the brief's list of checks.** Without it, the real 0050 and 0051 would not be refuted: each also says the second row "names a charging case the request excludes". The check only states the word order Core read in the row's label. The judge's standing instruction already says that an item sold with an excluded part is still the item. The risk: a real accessory whose label starts with the item phrase (for example "Wireless Earbuds Charging Case") would be re-asked, and could end unsure rather than no. It would never become a yes. The supervisor may drop this check.
3. **Unknown readings are not weighed** (0081's unknown, "share the name", sits beside a yes). The brief covers nos. Extending the rule to t503's `contradictedUnsure` would need its recheck text (`recheckWords`, which only talks about pages) and `doubtContradicted` in `build-test/judge.ts` to be generalised.
4. The new outcome is `unsure`, and it carries the refuted reading as `unconfirmedReading`, labelled "contradicted by Core's record: …". Its `why` gives Core's findings, so the supervisor's repair now sees Core's evidence (root cause 3 in the debug). I did not touch `project-agents/` or `flow-bootstrap/`, so nothing there reads `refutedNo` specifically.

## Addendum: coordinator decisions applied

1. **Mixed double no keeps the verdict no.** In `refutedMark` (`agreement.ts`), a double no is now marked for re-ask only when both calls are wholly refuted. When one no stands, the refuted one is still labelled "contradicted by Core's record: …" in the combined reading, but it is not re-asked. The two nos refute as t501 expects. A split, meaning a yes beside a refuted no, is still re-asked.
   - In `build-test/tests/judge.test.ts`, the t501 test "two noes, one claiming pages the record says do not exist: the other reading leads and that one is marked contradicted" is restored to its original expectation: no, with call 2's reading leading and call 1 labelled contradicted. It also now checks `spent.calls === 2`.
   - Added a test in the same file: two nos that both make the refuted pages claim. Each call is re-asked, and when both repeat it the verdict is unknown, never no (4 calls).
   - Added a test in `refuted-no/tests/reask.test.ts`: a refuted no beside a real-defect no is labelled, nothing is re-asked, and the verdict is `does_not_answer`, which fails the run.
   - Existing tests still cover the double no with both calls refuted being re-asked: `reask.test.ts` (debug shape) and `judge-route.test.ts` (candidate trial and subflow trial).
   - The headers of `agreement.ts` and `build-test/judge.ts` now describe this. Open question 1 above is settled.
2. **`excluded-kind-claim.ts` is kept unchanged.** Open question 2 above is settled.

Commands after these changes:
- `npx tsc --noEmit -p .` (packages/fluxiq): exit 0, no output.
- `npx vitest run …/result-verification …/service/candidate-trial …/service/subflow-trial …/service/project-build`: 106 files, 897 tests passed.
- `node scripts/structure-audit.mjs`: "structure-audit: passed (361 warning(s), 1156 baselined)".
