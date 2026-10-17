# t686: a re-ask replaces only a no whose every reason Core settled

Worker report for brief `t686-reask-only-settled-nos` (fixes 1 and 2 of debug note
`run-mvblov2i-abb7d82e`). Worktree `fxwork/t686/!FluxIQ`, branch `task/t686-reask-only-settled-nos`. Nothing committed.

## Outcome

Done. One shared rule (`agreement/no-reasons.ts`) now gates every re-ask whose answer can take a no's
place: t607 (refuted no, including the t628 chained re-ask), t515 (unstated exclusion) and t666
(narrowing). Core's narrowing words no longer vouch for split facets. Replayed onto another kind of
site, this run's two judge replies now leave the double no standing, and no call is asked again.

## The defect, verified in code first

The debug note's claim is correct. In the base `unsure-doubts/narrowing.ts`,
`automationStudioResultNarrowingNoBlamed` did three things:

- It kept every sentence of `observed` and `advice` that matched `BLAMES` or `NOT_NAMED`.
- It collected every step such a sentence named, by label, node id, group or option, matched
  anywhere in the sentence, row names included.
- It required each collected step to be a request-words step or a removed-none step.

It never looked at sentences without a blame word, and never asked whether the no gave any other
reason. `narrowing-no-reask.ts` re-asked on that result alone, although its header promised a re-ask
only where a no "blames only such steps". Two consequences in this run:

- 0044's sponsored-rows sentence was never weighed. It does contain "excluded", but it names no
  step, so it added nothing and blocked nothing.
- 0044's holder sentence matched the Retailer step through the row name "ValueRidge Essentials ...".

## What changed and why

**`agreement/no-reasons.ts` (new): the shared rule.**

How a no is cut into reasons:

- `observed` and `advice` are cut into parts: by sentence, after Core's own condition wording is
  removed (as `weigh.ts` does, t624), and within a sentence at `;`, `, but`, `, yet`, `, however`,
  `, while`, `whereas` and `, and` (outside quotes and brackets).

Which parts are not reasons:

- A part calling something harmless, redundant, correct or matching the request (`APPROVES`, not
  when negated).
- A part opened by ", and" that approves and refers back ("them", "it", "so", ...) also takes the
  part before it out. This covers "..., and condition 2 then drops them, so the filter is redundant".
- In `observed`, a part that says nothing is wrong (`FAULT`) and names no row (no quote, no
  capitalised name past its first word, no row Core's record holds). For example, "read kept 12 rows".
- In `advice`, a part that only keeps something.

When a reason counts as settled:

- The caller's `addressed(part)` accepts it: it is the recheck's kind.
- Or Core's record refutes its sentence weighed alone (`automationStudioResultRefutedReading`).
- Or, for a part naming nothing, the record wholly refutes the whole reading. This is weigh's
  "rests on its neighbours", applied only on the record path, never on a recheck's kind alone.
- Or, for advice, every quote and capitalised name in it appears in an observed reason that is
  already settled.

If any reason is unsettled, the no stands.

**`unsure-doubts/narrowing.ts`**

- `automationStudioResultNarrowingNoBlamed` now goes through the shared rule. A part is addressed
  when it names at least one step and every step it names is a request-words or removed-none step,
  and it either blames them or names no row. It takes an optional `record`.
- Before step names are matched, row labels are removed: rows the reads left out
  (`leftOutOnlyByThis` labels, `leftOutTogether`), plus the record's stored rows and pools when the
  record is given. Every quoted text that is not a step's own label, option, group or id is
  removed too.
- A dotted node id's last segment ("s8") now names its step.
- Fix 2: a split-facet step's words state what it chose, its group, the options left and the counts.
  They say its option is one word of the request's phrase, as is the other option in another group,
  and that "a site filter's option words do not show that each kept row meets that part of the
  request; a row's own text does". They never say "the request itself says".
- A doubt naming a split facet is not contradicted (the t655 path).

**`unsure-doubts/split-facets.ts` (new).** Two or more steps in different groups, each choosing an
option whose request words are one word, where those words fall in the same clause with at most 4
words between each. A comma clause alone was too coarse: "Thai restaurant ... with outdoor seating
this weekend".

**`unsure-doubts/narrowing-no-reask.ts`.** Optional `record` input, passed through. The recheck adds
the caution sentence about site filter option words. The header now records the t686 rule.

**`unsure-doubts/recheck-words.ts`.** The narrowing doubt frame adds the same caution sentence. The
pages and dedupe frames are unchanged.

**`agreement/reask-contradicted.ts`**

- **t607 and the t628 chain:** the refuted re-ask runs only where every call that `refutedNo` marks
  has all its reasons settled by the record. Otherwise the outcome is left as it is (t501's rule for
  a double no).
- **t515:** the re-ask runs only where every reason is the kept-row kind (`keptRowReason`: it
  contains one of the exclusions, or speaks of a kept row or of leaving rows out, and does not speak
  of rows missing or left out, pages, order or repeats), or the record refutes it.

**Barrels.** `agreement/index.ts` exports `no-reasons.ts` and has a t686 header paragraph.
`unsure-doubts/index.ts` exports `split-facets.ts`. `narrowing.ts` imports
`../agreement/no-reasons.ts` directly, not through the barrel, because the agreement barrel leads
back through `reask-contradicted.ts`. The audit allows this, and `no-reasons.ts` imports only
`refuted-no`.

**`ask-again.ts`: unchanged.** See "Open questions".

### Existing tests whose input changed (2), and why

Both tests used the same split no:

- observed: "A row that is not a tool was left out."
- advice: an unstated exclusion

That observed sentence states a left-out reason, which the t515 recheck (rows kept and exclusions
advised) does not address, so under the rule the no now stands and is not re-asked. I changed the
observed to the canonical t515 kept-row shape, "A refurbished bundle was stored.", so each test keeps
testing what it was written for. Their expectations are unchanged. The original shape is now pinned
as standing in the new `agreement/tests/reask-contradicted.test.ts`.

1. `result-verification/tests/verify.test.ts`: "asks a split's no once more when its advice excludes
   by words the request never states".
2. `result-verification/tests/first-ask-route/tests/first-ask-confirmed.test.ts`: "is not first-ask
   confirmed after a split's no asked again (t515)".

No other existing expectation changed. The t663-t666 and t677 suites pass unmodified, including
`narrowing.test.ts`, `narrowing-no.test.ts` and `tests/reask-route/tests/narrowing-no-route.test.ts`.
Those still see "the request itself says X", which is kept for a lone request-words option.

### New tests (21, in 5 files)

**`agreement/tests/no-reasons.test.ts`** (7) covers:

- addressed reasons;
- an unaddressed kept-row reason, as its own sentence or its own clause;
- approvals and their negations;
- advice that rests on settled reasons versus advice naming something new;
- reasons refuted by the record, with Core's condition wording removed;
- an unnamed reason resting on its neighbours only on the record path;
- a neutral part that names a row.

**`agreement/tests/reask-contradicted.test.ts`** (4): a t515 control and the no that now stands; a
t607 control and a refuted double no whose advice names something new, which now stands.

**`unsure-doubts/tests/narrowing-only.test.ts`** (4) is the replay of this run's judges 0043 and 0044,
paraphrased onto a concert listing: host, seats and tonight filters, a "4 & up" filter that removed
no row, and promoted rows stored.

- The double no stands, and `ask` is never called.
- 0044's shape gets no words.
- 0043's shape still gets words. Short ids name its steps. There is no "the request itself says" for
  Seats or Tonight; their split-facet sentence and the caution are there instead.
- A row named after the host's option does not name the host step.

**`unsure-doubts/tests/split-facets.test.ts`** (4): the venue example ("outdoor seating this weekend"),
non-splits, and the doubt path.

**`unsure-doubts/tests/recheck-words.test.ts`** (2): the caution in the narrowing frame; the pages
frame is unchanged.

**Fix-off check.** I restored the HEAD versions of the 6 modified source files (tests and the new
modules left in place) and ran the 4 new behaviour files: 11 of 14 failed. The replay's "keeps the
double no" was among them. The 3 that passed are deliberate controls: a t515 re-ask that should still
happen, a t607 re-ask that should still happen, and the unchanged pages/dedupe frame. I then restored
my versions. `no-reasons.test.ts` tests the new module itself, so it cannot be run with the fix off.

## Commands run and observed results

Baseline before any edit:

- `cd packages/fluxiq && npx vitest run <rv>/result-verification <rv>/service/candidate-trial <rv>/service/subflow-trial`
  -> `Test Files 145 passed (145)`, `Tests 1197 passed (1197)`.

Final:

- `cd packages/fluxiq && npx tsc --noEmit -p tsconfig.json` -> no output, exit 0.
- `cd packages/fluxiq && npx vitest run src/programs/automation-studio/runtime/result-verification src/programs/automation-studio/runtime/service/candidate-trial src/programs/automation-studio/runtime/service/subflow-trial`
  -> `Test Files 150 passed (150)`, `Tests 1218 passed (1218)`, Duration 142.77s.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (392 warning(s), 1155 baselined).`
  exit 0. Its only line for my area is the advisory
  `[directory-files] .../result-verification/agreement/: 22 source files is past the 15-file advisory threshold`.
  It was 21 before; the hard limit is 25. There is no import-cycle finding.

Fix-off run:

- With the 6 source files at HEAD: `vitest run` on the 4 new behaviour test files -> `Tests 11 failed | 3 passed (14)`.

Two intermediate full-directory runs caught a regression on the t629 and label-condition routes.
Core's condition wording was being read as a judge's quote, and "Stored only 2 rows." was being read
as a reason. Both are fixed above.

## Not verified

- **No live run and no real judge.** The replay uses paraphrased replies with a scripted `ask`.
- **`verify.ts` does not pass `record`** to `automationStudioResultReaskNarrowingNo`, and I do not own
  that file. In production the t666 path therefore removes row names only through the reads'
  left-out labels and quoted texts, and settles a reason only as a step blame. A reason the record
  would refute keeps the no standing there, which is conservative. Passing it would be a one-line
  change: `record` from the agreement's no record. That record is built in `agreement/no-record.ts`
  (`noRecordOf`, not exported), so the change needs an export or a call to
  `automationStudioResultNoRecord`.
- The full Core suite and other packages were not run, per the brief.

## Open questions or contradictions found

1. **`ask-again.ts` is not a re-ask path.** `automationStudioResultVerificationAskAgain` decides only
   whether the second call is made. That answer is weighed beside the first and replaces nothing, so
   the "only settled nos" rule has nothing to gate there. I left it unchanged and said so in the
   agreement barrel's header. The brief and the debug note both list it.
2. **The rule's reading is word-based.** Its limits:
   - An approval joined by ", and" without a back-reference does not cover the clause before it.
   - An approval and a complaint in one part with no cut between them dismiss the whole part.
   - "left out" alone is not a `FAULT` word. This matches `weigh.ts`; adding it broke the t629
     route, where "Condition 2 left them out" rests on its neighbours.
   - "match the request" also dismisses conditional advice ("keep X only if ... match the request").
   These are listed in the module header where they are design choices.
3. **Fix 2's last line is outside my ownership.** The debug note says the same point belongs in the
   builder's generic read guidance (`llm/**`), with a venue example. I did not touch it.
4. **Kept wording.** "The request itself says X" is kept for a lone option that is the request's own
   words, because the t655/t666 expectations depend on it. The brief asked for it to be dropped only
   in the split case. The supervisor may want it reworded to a pure measurement later; that would
   change 3 existing test expectations.
