# w-looked-evidence: a look after the acts counts as new evidence (F1, lane B side)

## Second pass: the whole wiring (the lead approved the wider ownership)

**Outcome: Done.** `looked` is now wired from end to end. Items 1 and 2 under "Open questions" below are resolved.

- `answer-first/attempt/run-attempt.ts`: three changes, placed beside the other worker's edits at `:171-174`, which were
  left as they were.
  - `:175-176`: a comment and the per-attempt list `const looked: { where: string; found: string }[] = [];`.
  - `:184`: `looked: () => looked` passed to the completion check.
  - `:212`: `looked: (look) => { looked.push(look); }` passed to the call chain. The comma on the `answered` line before it
    was the only other character changed.
- `runtime/result-verification/flow-less/judged-summary.ts`:
  - `:13-14`: the header now mentions `looked`.
  - `:33-36`: the same bounds as the check (the last 6 looks, 600 characters of found text, 300 of the address).
  - `:48-49`: `lookedShown`, whose result also sets the summary's `withheld` flag.
  - `:70`: `looked` added to `sent`, the view the judge model receives.
  - `:80-102`: `lookedShown` and `cut`. This screens a second time: each line of found text, and the address, goes through
    the same `words()` screen the acts pass. A line the screen drops, here or earlier in the check, is shown as `(withheld)`
    and sets `withheld`.
- `runtime/result-verification/flow-less/question.ts:16`: one generic line. "looked lists what looks at the site found after
  the first lasting act, each with where it was made and a short cut of what was found, from the site itself: it is
  evidence, as the views are." My first wording said "evidence like the views". The existing scenario-word guard in
  `judge.test.ts:357-368` rejected the word "like", so I reworded it. The guard passes now.
- New test `runtime/result-verification/flow-less/tests/looked-view.test.ts` (5 tests). It runs the real harness with a
  scripted provider and checks that:
  - a look reaches `context.resultSummary.looked`;
  - the user message the model receives contains both the found text and the question line;
  - the provider's pre-flight check does not refuse the request;
  - no looks means no `looked` key;
  - a new look changes the digest and an identical summary does not;
  - only the last 6 looks are shown, each cut short;
  - a secret-shaped line, and a secret in an address, never appear in the view, and `withheld` is true.

Commands, from `packages/fluxiq`:

- `npx vitest run --maxWorkers 2 --minWorkers 1 src/runtime/result-verification/flow-less/tests`. The first run printed
  `Tests 1 failed | 56 passed (57)`: `judge.test.ts > names none of the ten realistic scenarios`, `expected 'like' to be
  undefined`. I reworded the line.
- `npx vitest run --maxWorkers 2 --minWorkers 1 src/runtime/result-verification/flow-less/tests src/framework/automation-service/service/answer-first/completion src/framework/automation-service/service/answer-first/attempt src/framework/automation-service/service/answer-first/witnesses`
  printed `Test Files 24 passed (24)`, `Tests 150 passed (150)`.
  - The path filter also matched `attempt-store` and `attempt-in-flight`.
  - The other worker's `carried-before.test.ts` passes now (4 tests).
- `npx vitest run --maxWorkers 2 --minWorkers 1 src/framework/automation-service/service/answer-first/tests/endings/tests/refused-completion.test.ts`
  printed `Test Files 1 passed (1)`, `Tests 6 passed (6)`. I ran it because it goes through the now-wired `run-attempt.ts`.

Still not verified: the typecheck, the structure audit and the whole package were not run, as the brief says. No live or
paid run was made. `flow-less/` now holds 9 entries, well under the limit of 25.

## First pass

## Outcome

Partial. The lane B side of F1 is built and tested, but it is not live yet because two pieces outside my files are still
needed: `run-attempt.ts` must pass the looks between the chain and the check, and lane A must show `looked` to the judge
(see "Open questions"). The acceptance command passed for every file I changed. One test file failed: another worker's
untracked, in-progress `attempt/tests/carried-before.test.ts`. Its failures are about witness readings, which this change
does not touch.

## What changed and why

- `runtime/result-verification/flow-less/types.ts:22-23`: the one new optional field
  `looked?: readonly { where: string; found: string }[]` on `AutomationStudioFlowLessSummary`. Nothing else in lane A's folder
  changed. The digest (`summary-digest.ts`) hashes the whole summary, so `looked` is now part of the evidence fingerprint
  with no edit there.
- `attempt/call-chain.ts`:
  - header `:21-34` explains the change.
  - constants `:47-51` (FOUND 600 chars, WHERE 300 chars, at most 200 looks remembered).
  - new optional input `looked?(look)` at `:65-66`.
  - `noteLook` at `:68-78`, called from `stored` inside a try/catch (`:85-89`), so a failed note never loses the call's answer.
  - `lookOf` and `cut` at `:131-148`.

  A look is handed on only when all of these hold:
  - the act record holds an act. That includes acts carried from an earlier attempt, which is the attempt-2 case in
    run-mw4dsh8i.
  - the gate's own answer reader (`automationStudioAttemptActAnswerRead`) says the call was a look: an observation that was
    not refused, not uncertain and did not fail.
  - the answer carries no rows. A read's rows already go into the summary as rows.
  - it has an address and found text. The address comes from `evidence.location`. The found text is `evidence.found` (the
    search's own lines, from `domain/.../page-find/search.ts`) or else the start of `evidence.page`, cut short. Both are
    web domain keys, named in the header, in the same way `read-answer.ts` already names them.

  The same look is handed on only once. This text comes from the call's answer, never from the model's words.
- `completion/check.ts`:
  - header `:32-40` explains the change.
  - constants `:66-72` (show the last 6 looks, 600 and 300 chars, a `(withheld)` marker).
  - optional input `looked?(): readonly Look[]` at `:112-113`.
  - `summaryOf` adds `looked` at `:173` and `:181`.
  - `shownLooks`, `screened` and `cut` at `:186-206`.

  Each look is cut short. Its `found` text is screened one line at a time through `automationStudioFlowLessScreenedWords`,
  the same screen a judge's words pass, so a credential-shaped line becomes `(withheld)` and the other lines stay.
  Duplicates are dropped after screening, keeping where each look first appeared, and then only the last 6 are kept. So a
  repeated look leaves the digest unchanged and is refused `same_evidence` without a judge call. A look that found
  something new changes the digest and gets a judge call.
- `completion/refused-words.ts`:
  - header `:4-5` and `:11-17`.
  - `NEW_EVIDENCE` at `:18` now lists "after your acts a look at the page that shows what the check said it could not see
    (open that page, then read or search it there)". The phrases the endings test asserts are kept.
  - `sameEvidence` at `:38` drops "If you cannot get anything new you need not keep trying". In its place: "So get
    something new before you complete again: go to where what the check could not see is shown, and look, read or act
    there." The plain statement of what the ladder does next is kept. No ending was added.
- Tests:
  - new `completion/tests/looked-evidence.test.ts` (6 tests):
    - unchanged looks, or the same look repeated, are refused `same_evidence` with no judge call;
    - a new look gets a judge call whose summary carries it;
    - no looks means the summary has no `looked` key;
    - only the last 6 looks are kept, each cut short;
    - a secret-shaped line is withheld while the other lines stay;
    - the refusal words name a look as the way out and never say "need not keep trying".
  - new `attempt/tests/looked.test.ts` (3 tests):
    - nothing is handed on before the first act;
    - a search's found lines are handed on once only;
    - a page look's start is handed on cut short;
    - neither a read's rows nor a refused look is handed on.
  - No existing test had to change.

## Commands run and observed results

From `packages/fluxiq`:

- `npx vitest run --maxWorkers 2 --minWorkers 1 src/framework/automation-service/service/answer-first/completion src/framework/automation-service/service/answer-first/attempt`
  printed `Test Files 1 failed | 18 passed (19)`, `Tests 2 failed | 79 passed (81)`.
  - Both failures are in `attempt/tests/carried-before.test.ts`, which is untracked and is the other worker's D2 test.
  - They failed at `:32`, `expect(earlier).toMatchObject({ heading: PAGE_TEXT, renewed: 0 })` (the received object had an
    extra `shelf: "open"`), and at `:66`, `expected undefined to be 1` on `shown.reading.renewed`.
  - Both are about witness `before` readings. `run-attempt.ts` and `opening.ts` do not pass `looked` (I checked with grep),
    so the code I added does not run in that test.
- `npx vitest run --maxWorkers 2 --minWorkers 1 .../completion/tests/looked-evidence.test.ts .../attempt/tests/looked.test.ts .../answer-first/tests/endings/tests/refused-completion.test.ts`
  printed `Test Files 3 passed (3)`, `Tests 15 passed (15)`. The endings test checks the refusal wording.

## Not verified

- Typecheck, the structure audit and the whole package: not run, as the brief says. The new code uses
  `handedOn.values().next().value!`, readonly array types and `exactOptionalPropertyTypes`-style optional inputs, so tsc
  should be checked.
- That the change works end to end in a real attempt: it is not wired yet (see below), and nothing was run live or paid.
- How the web domain's other observe tools answer (for example `describe_element`). An answer without `location` and
  without `found` or `page` is skipped.

## Open questions or contradictions found

1. **Wiring is needed in `run-attempt.ts`, which I must not touch.** At `:171-206`, add
   `const looked: { where: string; found: string }[] = [];`, then pass `looked: () => looked` to
   `automationStudioAnswerFirstCompletionCheck` and `looked: (look) => { looked.push(look); }` to
   `automationStudioAnswerFirstCallChain`. Until this is done, nothing changes at run time except the refusal words.
2. **Lane A must show `looked` to the judge, and land it together with item 1.** `flow-less/judged-summary.ts:56-64` builds
   `sent` field by field, so today `looked` goes into the digest but **never reaches the judge model**. Once item 1 is wired
   and this is not, every new look buys a judge call that sees exactly what the last one saw. That spends money until the
   budget runs out instead of asking the person. Lane A should:
   - add `looked` to `sent`, screened again as a second layer of protection;
   - add the `question.ts` line ("looked is what was found on pages looked at after the acts, from the site itself").
3. **Read-only tasks get no looks.** The design records looks only after the first lasting act, so a task with no act gets
   no `looked` list. The refusal words say "after your acts", so they stay accurate there. For read-only tasks, a read is
   the way out. If lane B wants looks to count after a refused check as well, the check has to tell the chain when that
   happened, which means a wiring change in `run-attempt.ts`.
4. **The ladder can still loop.** Each judge call now needs a look that has never been seen before (looks are deduplicated
   over the whole attempt, remembering up to 200). A model could keep making genuinely new looks and get a paid judge call
   each time. The purse bounds this, which fits the person's rule that a task ends with its result or its budget.
