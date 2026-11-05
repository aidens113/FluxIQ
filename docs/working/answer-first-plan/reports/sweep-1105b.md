# Sweep 2026-11-05 b: two Core failures

## Outcome
Done. One real regression fixed in source (test 1), one deliberate growth recorded (test 2).

## 1. iteration-guards "stops an exploration at its token budget" (expected 8/6, got 6/4)
Cause, measured on this test's fixture (first `evidence_tool_decision` request, token pot 30,000):
- Before the fix: context 16,492 chars, `estimatedInputTokens` 5,689.
- With the old schema rule restored: context 9,850 chars, `estimatedInputTokens` 3,475.
- Difference: 6,642 chars, about 2,214 estimated tokens on every decision call. The 30,000-token pot
  (10,000 held for the patch, 10,000 reserved for the call in flight) then admits 4 exploration
  decisions, not 6: the old recovery path lost 2 decisions of 6, a third.

What grew was not the instructions (the tool-policy and flow-draft sentences date from 2026-09/10).
It is `decisionSchema.amend_draft` (the whole draft-amendment vocabulary: add/drop/repeat/bind/place...).
`e17cc4dbb` (t869, cache fix) changed `evidence-loop.ts` so the schema offers amending whenever the loop
`drafting && maxDraftAmendments > 0`, to keep the head constant. Before, it offered it only when a step
was amendable (`canAmend`). The recovery exploration passes no `draft`, so `drafting` is true by
default and it got the whole vocabulary on every call although it builds no Flow.
That is guidance reaching a path where it cannot be used, so I fixed the source, not the numbers.

Change: `packages/fluxiq/src/runtime/llm/evidence-loop.ts` (decision schema line, plus its comment):
`input.draft ? limits.maxDraftAmendments > 0 : canAmend`. A loop that declares a draft to build keeps the
stable, always-present vocabulary (t869 cache behaviour unchanged); a loop that declares none (recovery)
gets the old rule. The test file is unchanged: it passes with its original numbers (8/6) and
`run.executed` still 6.

## 2. extraction-vocabulary "is sent with the request..." (at most 4,850, got 5,012)
Cause: `e17cc4dbb` (t869) added to `record-output-contract.ts` writeMode text: "On a read of a list,
replace says this read is the list as it now stands, and append says it adds to what this datasetId
already holds; use the same datasetId for the same list." (178 bytes, measured; 4,834 + 178 = 5,012),
plus a shorter form in the condensed text. It is generic (list, datasetId; no site, product or task
words), and `record-output-contract.test.ts` pins its phrases, so I kept the text.
Change: bound 4,850 -> 5,025 in `extraction-vocabulary.test.ts`, with a comment entry in the same style
(what, why, bytes, new size). The tripwire stays tight, 13 bytes of room.

Extension parity: guidance text did not change in this work. `parity.test.ts` pins only the
script-examples sections (format/act/loop/state), not the record-output contract, so no new values.
The extension was not touched.

## Commands run and observed
- Measured the request with a temporary logging line in the test (restored byte-for-byte from a backup;
  `git diff --stat` shows the test file untouched) and a temporary edit of the schema line (reverted
  before the final edit).
- `pnpm.cmd exec vitest run src/runtime/adaptation/recovery/annotation/tests src/runtime/llm/tests src/runtime/llm/evidence-loop/tests src/runtime/llm/provider-task src/runtime/llm/draft-amendment-feedback --minWorkers 1 --maxWorkers 2 --reporter=dot`
  -> 68 files, 984 tests passed (includes iteration-guards with original numbers, and the cache-prefix tests).
- `pnpm.cmd exec vitest run src/runtime/flow-authoring/bootstrap/plan/tests ...` -> 20 files, 215 passed.
- `pnpm.cmd --filter fluxiq check` -> tsc ran, no errors printed.
- `node scripts/structure-audit.mjs` -> passed (528 warnings, 1097 baselined).

## Not verified
- Cache effect of the narrower rule on a real recovery run (a draft-less loop's schema may now flip once
  when amending first becomes offered, one cache miss, as before t869).
- Other `src/runtime/llm` folders outside those listed, and the draft-building tests beyond the folders run.
