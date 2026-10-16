# t665: judge text read whole, and step blame weighed by clause

Worker report. Core worktree `fxwork/t665/!FluxIQ`, branch
`task/t665-judge-text-whole-and-step-blame-by-clause`, base `f7a0c4d1`. Nothing committed.

## Outcome

Done. Fixes A, B, C and G from the debug
(`!FluxIQWebExtension/docs/working/automation-project-agents-plan/reports/a8-towels-run-mvam0lys-debug.md`)
are built and tested. I replayed the live run's judge steps through the changed code, reading each
judge's full text:

- 0043 and 0069 are now refuted whole, so they would be asked once more.
- 0063 is now contradicted only in part: its stored-holder reason stands.
- 0044 and 0073 stay refuted whole.
- 0064, 0075, 0082, 0057 and 0058 still stand.

I also made one addition the brief did not name: a "correctly excluded" rule (below). The 0043
replay could not pass without it once the full text was read.

## What changed and why

**A: the judge's whole text (`llm/harness/provider-result.ts`).**

- `readDiagnosisText` no longer cuts `expected`, `observed` or `changed` at 500 characters. An
  over-long text is now trimmed and read whole.
- Its warning was renamed from `llm_output.diagnosis_text_clipped` to
  `llm_output.diagnosis_text_past_bound`, with the message "...and was read whole". The bound stays
  500 in the instruction and the output schema.
- `clippedText` and `CLIPPED_MARK` are removed.
- Why not keep the clipped copy beside a whole one, as the debug suggested? The clipped string is
  the only thing that reaches `repair.judgement.observed` (provider-result -> verify.ts ->
  verdict.ts). Carrying a second copy would mean changing `structured-response.ts`, `verdict.ts` and
  the `repair.ts` contract, none of which I own.
- This follows the precedent in `llm/harness/context-packet.ts` ("Whole (2026-09-30)") and the
  "never cap model output" rule.
- Consequence: every consumer of the diagnosis texts now gets the whole text. That includes the
  repair directive's judgement and the builder prompts that carry it.

**B: blame on a step weighed clause by clause (`refuted-no/weigh.ts`, `refuted-no/missing-claim.ts`).**

- The per-sentence logic moved into `weighed()`. A new step, `byClause()`, runs only when the whole
  sentence is not already refuted and at least one clause blames only steps that Core measured as
  removing no row (`automationStudioResultNarrowingStepClaim` on that clause).
- When it runs, each clause is weighed as a sentence of its own:
  - Any clause that stands makes the sentence stand.
  - Otherwise, any refuted clause makes the sentence refuted.
- Clauses come from a new `automationStudioResultReasonClauses` in `missing-claim.ts`. It uses the
  same splitter as `automationStudioResultRowClauses`, which cuts at ";", ": ", ", but" and " and "
  before a quote. With an `everyAnd` flag it also cuts at every ", and " outside quotes.
- How each clause decides whether it says something is wrong:
  - A clause naming only conditions is judged on its own words. So "condition 3 correctly drops
    them" is no reason.
  - A clause naming a row or a step is judged on its whole sentence's words. This keeps a sentence's
    rows weighed at least as strongly as before. My first version used each clause's own words
    only, and that let "condition 1 dropped <row>, which the request asks for" stop counting as a
    reason.
  - A clause naming nothing rests on its neighbours.

**Addition outside the brief: "correctly excluded" is no reason (`weigh.ts`, `APPROVED`).**

- Before the "does this say something is wrong" test, phrases such as "correctly / rightly /
  properly excluded / dropped / left out" are set aside, in either word order.
- Why it was needed: read whole, 0043's last sentence ("Condition 3 left out <A> (4.3) and <B>
  (4.4), correctly excluded.") stood only on the word "excluded". It names rows a rating bound
  settled, and that bound does not quote the request, so no claim refutes it. Under the clipped text
  that sentence was simply cut off, which is how the debug's replay reached "wholly refuted".
- Any other word for wrong in the sentence still counts: "should not be excluded", "but", "not".

**C: left-out claims only read in clauses that name a row (`refuted-no/missing-claim.ts`, `refuted-no/named-rows.ts`).**

- In `calledMissing`, the stored-only test now considers only the `left_out_by` clauses that name a
  row (stored, left out, or one Core cannot find), and needs at least one of them.
- In `valuesAgree`, a mention that spells a label in full now names that label whatever values
  follow it. The values check still applies to a mention that is only a prefix of the label.
- A and C ship together, as the debug said they must.

**G: rows left out together help tell labels apart (`refuted-no/record.ts`, `refuted-no/types.ts`, `refuted-no/named-rows.ts`).**

- Rows a read's conditions left out together, when they are not already in a pool, are added to
  every naming pool. They are also listed on the record as a new field, `unnamed`.
- `prefixesOf` gives no naming prefix to `unnamed` labels. They make other labels' prefixes longer,
  but are never named themselves, so a quote of one stays a row Core cannot find.
- Without that second rule, such a quote would have named nothing, and a "the result includes X"
  sentence would quietly stop being a reason.

**Barrel:** `refuted-no/index.ts` header comment extended. No new file in `refuted-no/` or `refuted-no/tests/`.

**Tests:**

- `refuted-no/tests/narrowing-step-claim.test.ts` (B):
  - the clause form is refuted at 40 to 40 results, and stands at 32 to 23;
  - it stands when another clause stands on its own (a row a bound left out called dropped, or
    "condition 1 should not be there");
  - it is read whole when no clause blames such a step.
  - Also two tests for the "correctly excluded" rule: it is no reason, but it stands with any other
    word for wrong.
- `refuted-no/tests/missing-claim-copy.test.ts` (C):
  - the colon form (0069) and the trailing-clause form (0043) are refuted with "another copy of it
    was kept";
  - both forms stand over a left-out title Core did not settle;
  - a sentence with no clause naming a row stands;
  - a whole label followed by "— both are ..., 4.5+" still names its stored row, while a prefix
    followed by "4.5 stars" does not.
- `refuted-no/tests/together-rows.test.ts` (G): a quote of a row left out together names no stored
  row and is unmatched; without the together listing the same quote names the stored row, as before;
  the stored row is still named by its own label.
- `request-rows/tests/run-mvam0lys.test.ts` (new; `refuted-no/tests/` is full):
  - The 0043 reading and advice, on a library fixture, pass through `parseAutomationStudioLlmProviderResult`
    whole (997 characters).
  - Weighed, the reading is refuted whole: the step finding, both "another copy" findings, and the
    availability findings.
  - As a double no through `automationStudioResultVerificationAgreement`, both calls are marked
    contradicted whole.
  - It stands when the rating step went from 23 to 16 results.
  - For A: a no whose first 480 characters hold only refuted claims, and whose text past 500 says a
    stored row is the wrong kind, weighs `wholly: false`. As a double no, both calls are marked
    contradicted only in part. The same text cut at 500 would have weighed `wholly: true`.
- `llm/harness/tests/long-diagnosis-text.test.ts` and `llm/tests/diagnosis-channel.test.ts` updated
  to expect whole text and the new warning code. The second is outside the folders the brief named.
  I changed it only because it asserted the clip.

## Commands run and observed results

- **Replay with Core's own vite-node:**
  `node node_modules/.pnpm/vite-node@2.1.9_@types+node@22.20.1/node_modules/vite-node/vite-node.mjs --root packages/fluxiq <scratchpad>/t665/replay.ts <run> <steps>`.
  This is the debug's `weigh-clip.ts` pointed at this worktree, with `WHOLE=1` for unclipped text.
  - Before the changes, with whole text: 0043 `WHOLLY=false` (the step sentence, the condition-1
    sentence with no claim, and the "correctly excluded" sentence all stood); 0063 `WHOLLY=false`;
    0069 `WHOLLY=false`.
  - After: 0043 true, 0044 true, 0063 false, 0064 false, 0069 true, 0073 true, 0075 false, 0082
    false, 0058 false, 0057 false.
- **Mutation checks:** I backed up each source file, reverted one fix at a time, ran the four test
  files above, and restored the file. Each revert failed tests: the whole-label rule 2 failed, the
  clauses that name a row 4, clause weighing 3, the "correctly excluded" rule 4, the `unnamed`
  pools 1. `cmp` then confirmed all four files were restored.
- **Tests:**
  `npx vitest run <runtime>/result-verification <runtime>/llm/harness <runtime>/llm/tests/diagnosis-channel.test.ts <runtime>/service/candidate-trial <runtime>/service/subflow-trial`
  -> `Test Files 184 passed (184)`, `Tests 1534 passed (1534)`.
  - The barrel-import change came after that run. I re-ran `run-mvam0lys.test.ts` alone afterwards
    -> `Tests 6 passed (6)`.
- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` in `packages/fluxiq` -> exit 0, no output (run
  after the final edit).
- **Structure audit:** `node scripts/structure-audit.mjs`.
  - First run: 1 FAIL [imports], because the new test imported `llm/harness/provider-result.ts`
    directly.
  - Changed it to the harness barrel, imported last. Importing that barrel first had given
    "screenAutomationStudioLlmEvidence is not a function", a circular import.
  - Final run: `structure-audit: passed (388 warning(s), 1156 baselined)`.

## Not verified

- No live run (none was asked for). "0043 and 0069 would be asked once more" comes from the replay
  and from the agreement marking both calls contradicted whole. A re-ask may still say no.
- I did not check what whole diagnosis texts do downstream: the size of builder prompts, or any
  consumer that assumed 500 characters at most. I did not search the extension repo for consumers
  of `llm_output.diagnosis_text_clipped`; a search of the Core sources found none outside this
  change.
- `docs/architecture/automation-studio/llm-flow-bootstrap.md:1294` still describes the clip and the
  old warning code. That file is outside what I own.
- No full `pnpm check` or full test run, per the twice-a-day rule.

## Open questions or contradictions found

1. **The "correctly excluded" rule was added beyond the brief.** The brief's 0043 replay needs it
   once the text is read whole: the debug's "wholly refuted" result came from a clipped replay. Keep
   it or drop it, but with it dropped the 0043 replay fails.
2. **Clause weighing now refutes one case that used to stand.** Take "s6 keeps only hardcover, and
   condition 1 dropped "<row no read saw>"", where s6 is a step that removed no row. The second
   clause is now refuted by the t654 unseen-row claim. As one whole sentence, the step mention used
   to keep it standing (`blamesAStep`). This matches t654's header ("unless Core measured that every
   step it blames removed no row") but changes how such a sentence lands. Not covered by a test.
3. **Single-quoted labels are not quotes to `named-rows.ts`.** The pattern there matches only double
   and curly quotes. With G, 0058's sentence about two holders (single-quoted, neither stored) now
   names nothing, so it is no reason. Before G it stood only because it was matched to the wrong
   stored row. If a single-quoted unknown row should count as a row Core cannot find, that is a
   separate change.
4. **The warning code was renamed** (`diagnosis_text_clipped` to `diagnosis_text_past_bound`). If
   the Lab or the extension greps for the old code, it needs updating.
