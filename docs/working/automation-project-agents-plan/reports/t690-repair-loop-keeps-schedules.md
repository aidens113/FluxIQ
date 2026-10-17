# t690: repair loop keeps schedules

Worker report. Brief: t690-repair-loop-keeps-schedules. Core worktree `fxwork/t690/!FluxIQ`, branch
`task/t690-repair-loop-keeps-schedules` (from dev d4730345). Nothing committed.

## Outcome

**Done.** All four fixes are made, each with tests that fail when the fix is reverted. Typecheck, the named test
directories and the structure audit pass.

## What changed and why

Paths below are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

### (a) A stall keeps every scheduled candidate

- New `flow-draft/scheduled-candidate/step-copy.ts`: `automationStudioFlowDraftStepCopy(step, reshape?)`. It deep
  copies the step, applies an optional reshape, then puts the scheduled candidate back. The candidate is carried only
  when the reshaped copy is still the configuration it was scheduled with (position aside), which is
  `automationStudioFlowDraftCopyScheduledCandidate`'s existing rule. So an edited step is never run as its saved version.
  Exported from `scheduled-candidate/index.ts` and from the `flow-draft/index.ts` barrel.
- The four stall sites now copy through it instead of `structuredClone`:
  - `llm/evidence-loop.ts:317` (refused-completion stall). The file is at 800 lines, so the import went onto an
    existing import line. It is still 800 lines.
  - `llm/decision-handlers/refusal-run.ts:56`
  - `llm/decision-handlers/refused-repeat.ts:119`
  - `llm/decision-handlers/searching.ts:56`
- The two existing copies of the same fix now use the shared function, so only one copy of it remains:
  - `flow-bootstrap/unfinished-build/round-ending.ts`: the private `stallCopy` is removed, and the header notes that
    the loop's stalls now copy through the same function.
  - `flow-bootstrap/unfinished-build/judgement.ts`: `automationStudioFlowBootstrapRepairSeed` does its renumbering
    in `reshape`.
- Other places that copy a draft, checked and left unchanged:
  - `flow-bootstrap/incomplete-draft/{kept,continuation,keeper,parse}.ts` copy into or out of the stored
    incomplete-draft record. A candidate is a WeakMap correspondence that is minted only while reading a saved node,
    and by design it cannot survive storage.
  - `llm/loop-configuration.ts` seed steps make a shallow copy and already carry the candidate.
  - `llm/evidence-loop/completion-attempt.ts:59` hands `checkCompletion` shallow `{ ...step }` copies. Those copies
    lose the candidate's correspondence, but they are a validator's view, not a hand-over to the next round. See Open
    questions.

### (b) The `next` hint describes the page loop Core accepts

In `llm/draft-amendment-feedback.ts`, `rowAct` now checks for a page loop first, using a new helper `pageLoop`.

- **When the listing sits inside a repeat-while span** (some step's routing has `while`, with the span running from
  that step through its `through`):
  - the hint says the page loop is in place;
  - it names the span and the step that moves the list on;
  - it says never to repeat that step over the listing.
  - It suggests no `repeat ... over`.
- **Without a page loop**, the existing row-act telling is kept, and one sentence gives the other form Core accepts:
  if the press moves the list on to its next page, send `{"step": <read>, "change": "repeat", "while": <press>}`.
- The feedback step type's `routing` gained the optional `through` and `while` fields. The loop already passes them.
- This covers both refusal kinds that reach `rowAct`: `changes_nothing` (Lab step 0183's kind) and `over_not_before`.

### (c) Builder read guidance

`llm/evidence-loop-decision.ts`: the live builder's decision instruction holds t606's filter sentence, and I put one
sentence right after it:

> A site filter's option words do not show that each row it keeps meets the request's words; a row's own text does:
> on a venue listing with separate Outdoor and Weekend filters, a request for outdoor seating this weekend is still
> checked against each row's own text in the read's where.

- The header comment records t690.
- I chose this file because t686 placed the point in the builder's `llm/**` guidance, and this is where the live and
  repair builders are taught filtering.
- `llm/deepseek/tests/system-prompt-pins.json` pins this exact prompt. I updated it by inserting the same sentence at
  the same place, and nothing else changed.

### (d) The verification passes Core's record to the narrowing re-ask

- `result-verification/agreement/index.ts` now exports `noRecordOf` as `automationStudioResultVerificationNoRecord`.
  It is an aliased re-export; `no-record.ts` itself is unchanged, and its six local callers keep the old name.
- `result-verification/verify.ts` passes `record: automationStudioResultVerificationNoRecord(input)` to
  `automationStudioResultReaskNarrowingNo`. `input` is the same agreement input the other re-asks use, so the record
  is the cached one.

### Tests (each new test fails with its fix reverted; observed below)

- `flow-draft/scheduled-candidate/tests/step-copy.test.ts` (new, 3 tests): keeps the candidate, including on a copy
  of a copy and across a renumbering reshape; drops it for an edited copy.
- `llm/decision-handlers/tests/stall-keeps-schedules.test.ts` (new, 3 tests): a loop seeded from a saved Flow with
  three scheduled steps. Each test stalls it one way and asserts the issue code and that every saved step handed to
  `stalled` still has its scheduled call:
  - refusal-run: three `keep`s, `draft_amendments_refused`;
  - refused repeat: `repeat_refused`;
  - searching: eight looks, `searching_without_acting`.
- `llm/tests/evidence-loop-seeded-draft.test.ts` (+1): the refused-completion stall at `evidence-loop.ts:317`.
- `llm/decision-handlers/tests/page-loop-told.test.ts` (new, 2 tests): the page-loop telling and the two-forms
  telling.
  - It sits beside `refusal-way-out.test.ts`, which was split out of `llm/tests/draft-amendment-feedback.test.ts`
    for the same reason. That file is at 797 lines, and `llm/tests/` is at the 25-file directory limit. Both
    placements were tried and failed the audit.
- `llm/evidence-loop/tests/authored-draft.test.ts` (+1): the sentence is in the instruction and names no Lab
  scenario's site words.
- `result-verification/tests/reask-route/tests/narrowing-no-route.test.ts` (+1): t666's Lakeshore no is extended
  with "Stored 4 rows including "<Osprey>", which is closed for the season." Osprey is a campsite the read left out,
  so Core's record refutes that sentence. The no is now asked once more, and two yeses confirm (3 calls).

## Commands run and observed results

Run in `fxwork/t690/!FluxIQ/packages/fluxiq` unless noted.

**Typecheck.**
- Command: `npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/fluxiq-build/t690-check.tsbuildinfo`
- First run: `TSC_EXIT=2`. Two problems in my new tests: wrong edge field names, and a `stalled` callback typed with
  mutable arrays. That run also overlapped a fix-off file swap.
- After the fixes, run again with nothing else in flight: `TSC_EXIT=0` and no output.

**Named directories.**
- Command: `npx vitest run src/…/runtime/llm src/…/runtime/flow-draft src/…/runtime/result-verification src/…/runtime/flow-bootstrap/unfinished-build`
  - `unfinished-build` is included because I touched `round-ending.ts` and `judgement.ts`.
  - The guidance file's directory is `llm`, which is already in the list.
- Result: `Test Files 1 failed | 391 passed (392)`, `Tests 3 failed | 3643 passed (3646)`.
- All 3 failures were in `llm/deepseek/tests/system-prompt.test.ts`, which pins the prompt text that (c) changes. I
  updated the pin as described under (c).
- Rerun of that file: `Tests 32 passed (32)`. The full directory set was not rerun after the pin change.

**Fix-off, (a).** I reverted one stall site at a time, then ran `stall-keeps-schedules.test.ts` and
`evidence-loop-seeded-draft.test.ts`.

| Site reverted | Result |
| --- | --- |
| `evidence-loop.ts` | `Tests 1 failed \| 10 passed (11)` |
| `refusal-run.ts` | `Tests 1 failed \| 10 passed (11)` |
| `refused-repeat.ts` | `Tests 1 failed \| 10 passed (11)` |
| `searching.ts` | `Tests 1 failed \| 10 passed (11)` |

Each site has its own covering test. The sources were restored from scratch backups.

**Fix-off, (b), (c) and (d).**
- I replaced `draft-amendment-feedback.ts`, `evidence-loop-decision.ts` and `verify.ts` with their `HEAD` versions.
- Result: `Tests 3 failed | 126 passed (129)`. The 3 failures were exactly the new tests for (b), (c) and (d). The (b)
  tests were in `draft-amendment-feedback.test.ts` then.
- After moving the (b) tests to `page-loop-told.test.ts`, I checked again with (b) off: `Tests 2 failed (2)`. With it
  restored: `Tests 2 passed (2)`.
- `step-copy.test.ts` cannot load without `step-copy.ts`.

**Structure audit.**
- Command, from the Core root: `node scripts/structure-audit.mjs`
- First run: 4 violations, all mine:
  - `draft-amendment-feedback.test.ts` at 816 lines;
  - 3 cases of statement packing in test callbacks.
- Then: 1 violation, `llm/tests/` at 26 files, after moving the test there.
- Final: `structure-audit: passed (395 warning(s), 1155 baselined).`

## Not verified

- No live or Lab run. Whether the repair lane now runs carried steps as saved after a real stall, and whether the
  model follows the page-loop telling, is untested on a real model.
- The full Core suite and other packages were not run, per the brief.
- The test for (a) uses a scripted loop. It checks that the stalled steps still have their scheduled candidates. It
  does not run a whole multi-round repair, through `phases.ts`, from a stall to the next round's test.

## Open questions or contradictions found

1. **`llm/evidence-loop/completion-attempt.ts:59`** hands `checkCompletion` shallow `{ ...step }` copies, so a check
   that asks `automationStudioFlowDraftScheduledCandidateCall` sees no candidate. Today's checks do not appear to ask,
   so I left it. If one ever needs to, it should copy through `automationStudioFlowDraftStepCopy`.
2. **(c) is in the live builder's instruction only.** The script format, `flow-bootstrap/plan/flow-script-format.ts:205`,
   has its own filter sentence (t606/t489) and was not changed, because the brief asked for one short line. If
   script-writing builders should carry it too, the same sentence fits after "...rather than reading every item."
3. **(b) needs the read's own while-repeat to recognise a page press.** When the model has not yet put the page loop
   on the read, Core cannot tell a next-page press from a row act. The telling then offers both forms rather than
   choosing one.
