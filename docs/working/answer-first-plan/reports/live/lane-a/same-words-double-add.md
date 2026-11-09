# Same words again pressed Add to cart again (run-mw4eb5r3-a20f3542)

Read-only investigation. No source changed. `S/` = `!FluxIQ/packages/fluxiq/src` in `fxwork/t875`. `AF/` = `S/framework/automation-service/service/answer-first`. `AR/` = `S/runtime/answer-first/act-record`. Step numbers are from `lab-runs/2026-11-05/run-mw4eb5r3-a20f3542/steps/`.

The run used Core's dist built at 19:05 PST. The t869 same-words commit `1bdc15c48` was made at 17:47 and the run started at 19:09, so the same-words code was in it (`dist/.../act-record/seed.js` has `heldOnRepeat`).

## Outcome

The cause is found and was reproduced provider-free against the built dist. Seeding, the task key and act identity all worked. Two things went wrong:

1. **A carried act still had room to count.**
   - The request asks for "two packs", so Add to cart was given `asked: 2`.
   - Attempt 1 got both packs with one Add press after a quantity `+`. That left the act at `landings: 1`.
   - The seed carried the act with `asked: 2, landings: 1`.
   - The attempt's own Flow run is gated with `counted: true`. In that mode `carried()` lets through any landed act whose count has room, and it never checks whether the act is an earlier attempt's. So the press ran.
   - The carried `+` was skipped (`heldOnRepeat`), so that press added one pack, not two: 2 -> 3.
2. **The Flow-less judge was told nothing about carried acts.** It saw "Add to cart (2 times)" as this attempt's own act. The run's landing had removed `carried`, so no "Already done earlier" line appeared. Its before witness was this attempt's own (qty 2). Its question tells it "What already held before is not credit for anything done here." So it judged "add two more", and that is exactly what its prompt asks it to do.

## 1. Was attempt 1's add recorded as landed? With what identity?

Yes. It was declared and claimed, it landed, and it was counted.

- **The press** (step 0014, `add_to_cart_1`): `web.output.dom-click` on handle `t712`, `consequences: ["modify_existing"]`, model claim `act: "a1"` (0013 decision). `effectApplied: true`, `web.action.succeeded`.
- **Act id** `act.6c925e2349130a78dfb61c92ca7cb54be7628338`, class `modify_existing`, state `landed`, on no row (no `onARow` in any `forModel` list). The judge at 0022 read it as "Add to cart: ValueRidge Everyday Dinner Napkins, 100 Count". The item words come from the page title and are in memory only (`AR/record.ts:161`). The 100 Count title is the product page's own.
- **Count:** `asked: 2, landings: 1`.
  - Probe on the dist: `automationStudioAnswerFirstAskedCounts(<task words>)` -> `[{"count":2,"quote":"two packs","act":"a1"}]`, and `AskedRepeats` gives 2 for `a1`, for `a1.quantity` and for an unclaimed press.
  - `readCount` sets the count at the first landing (`AR/record.ts:564-570`).
  - It is also proven by the label "Add to cart (2 times)" in attempt 2. `whatOf` adds "(N times)" only when `asked !== undefined && landings > 1` (`AR/record.ts:628-631`).
- **The `+` press** (0012, `qty_plus_1`, handle `t615`, `consequences: []`, claim `a1.quantity`) declared nothing.
  - Its answer said a line rose (`AR/gate/read-answer.ts:82`, `changedState`), so it was carried as `heldOnRepeat` (`AR/seed.ts:56-64`).
  - "Reject all" was carried the same way.
  - Both show in attempt 2 as `"undeclared":true,"carried":true` (0026 request, `core.attempt_note`).

## 2. Did attempt 2's opening seed the record from it?

Yes.

- **Task key.** Both attempts have `taskId: task.ab1a757a5377b4c02551218006422cecc60a274c` (`attempt.json`). The chat sent the identical instruction both times (0001 and 0023 decisions). The key comes from `instructionText` and `startLocation` (`AF/attempt/opening.ts:59`). It matched although attempt 2 began on the cart page, and `ordinal` went to 2.
- **Same Flow.** Attempt 2 has `startedFrom: { route: "use", attemptId: attempt.146381b5…, stepsDigest: 821074…}`.
- **Seed.** `seedOf` (`AF/attempt/opening.ts:99-109`) read the memory's acts. The act record was built with that seed (`AF/attempt/run-attempt.ts:142`).
- **What proves it:**
  - The 0026 note lists `Reject all` and `+` with `carried: true`.
  - The Flow run's steps 2 and 6 were "skipped: This was already done earlier in the task".
  - The Add entry has the same id as attempt 1's and reads "(2 times)". A fresh entry would read landings 1 with no label.
  - The Add entry has no `carried` flag, because `absorb` deletes `carried` when this attempt lands the act itself (`AR/record.ts:515-524`).

## 3. Why did the Flow run press Add anyway?

The cause was not a missing seed, not an identity mismatch and not a path that skips the record. The Flow-run path consults the record: `AF/run-acts/run-gate.ts:116`, `record.carried({... , ...counted})`, with `counted = { counted: true }` because the attempt's own run is `settle: true` (`AF/flow-run/flow-run.ts:119`, `run-gate.ts:97`). Then:

- `AR/record.ts:327-328`:
  ```ts
  const room = (entry) => call.counted === true && entry.state === "landed" && hasRoom(entry, identity);
  const found = this.entries.find((entry) => stands(entry) && !room(entry) && (matches(entry, identity) || …));
  ```
  `hasRoom` (`AR/record.ts:623-625`) is `identity.rows.length === 0 && entry.asked !== undefined && (entry.landings ?? 0) < entry.asked`. It has no `carried` check, so a carried act with `asked 2 / landings 1` reads as "room left" and `carried()` returns nothing. The gate then sends the press.
- The record's own header says otherwise (`AR/record.ts:110-113`): "A run that only carries acts from an attempt before it reads no count … what was done is not done again." A `settle` run both carries and settles, and the code does not tell the carried entries apart.
- The same hole is open at the other two doors:
  - `admit` (`AR/record.ts:181`, by hand): would answer `run`.
  - `stepDone` (`AR/record.ts:318`): would answer `false`.
- **Why the count was wrong in the first place:** it counts presses. Attempt 1 met "two packs" with one press after the quantity `+`. Core cannot see that a quantity control supplied the rest. That is the disclosed limit inside one attempt; across attempts it turns into a blind repeat.
- **Why the cart rose by 1 rather than 2:** the run skipped the carried `+` (step 6, `heldOnRepeat`) and pressed Add (step 7) with the stepper at 1.
- **The Lab's labels:**
  - "(2 times)" means attempt 1's landing plus this run's. It was not a wake press: the site shows one add (2 -> 3).
  - The "Qty" step left out is attempt 2's own repair, 0027 `dom-select` to 4. It came after the double add and did not cause it.

**Provider-free reproduction** (the dist, scratch script `scratchpad/probe/record.mjs`, nothing in the repository):

```text
attempt 1 entry: [{"state":"landed","asked":2,"landings":1}]
seed:            [{"state":"landed","carried":true,"asked":2,"landings":1}]
run gate, counted (settle: true): "not carried -> pressed"
run gate, not counted: {"what":"Already done earlier: Add to cart","state":"landed",…}
by hand admit: {"kind":"run"}
stepDone: false
```

## 4. What the judge at 0024 was given, and why it judged "add two more"

From `steps/0024-judge/request.txt`:

- **`question`:** the fixed Flow-less question (`S/runtime/result-verification/flow-less/question.ts:10-22`). It says "It was done directly, by hand", "Judge the change, not the absolute state", and "What already held before is not credit for anything done here."
- **`acts`:** one entry, `what: Add to cart (2 times)`, `classes: [modify_existing]`, `state: landed`. There is no "Already done earlier" line. That prefix is added only while `entry.carried` (`AR/record.ts:367`, `AR/carried-words.ts`), and the run's landing had just cleared it (`AR/record.ts:520`). The undeclared `+` and Reject all are left off the result's acts by design (`AR/record.ts:371-373`).
- **`witnesses.before`:** the cart with napkins Qty "2" ("Cart (3 items)"). It was read before *this attempt's* first lasting act, the Flow's Add (`AF/witnesses/witnesses.ts`).
- **`after`/`endView`:** Qty "3".
- **What it was not given:** no `askedAgain`, no same-words flag, and no earlier attempt's before witness. The summary type has no field for any of these (`flow-less/types.ts:9-22`). Nothing under `S/runtime/llm` mentions "Already done" or earlier attempts.

So the judge read the same words as a fresh request and judged against attempt 2's own before witness. By its own rules the request was "add two packs" and the change was +1, so "only one pack was added net, not two" (0024 diagnosis, `act_wrong` on "Add to cart (2 times)").

- The round model was told at 0026 not to press carried acts again. The Add no longer read as carried, and the judge's "no" asked for two more. So it set the cart Qty to 4 with a different act (`dom-select`, 0027), which nothing carried.
- At 0031 the judge saw before 2 and after 4 and said yes.
- The Lab's oracle then marked it a repeated act: `asked 0, landed 2`.

**A latent judge defect, even with fix A below.**
- If the Add had been refused, no lasting act would have run. So there would be no before witness (it is read only before a first lasting act).
- The judge would see Qty 2, one act "Already done earlier: Add to cart…", and a question saying "What already held before is not credit for anything done here." Nothing in the question says what "Already done earlier" means.
- A real judge may then say no or unknown. The rounds could not press Add, because the record refuses it, so the attempt could spend until its budget is gone.
- t869's own proofs of this road used scripted judges (`same-words-rule.md`, "Not verified"). The real-judge behaviour on carried acts has never been exercised.

## 5. Smallest correct fixes and the tests that would have caught them

| # | Fix | Files | Belongs to |
| --- | --- | --- | --- |
| A | A carried act has no room: `hasRoom` returns false when `entry.carried === true`. One line covers all three doors (`carried` with `counted`, `admit`, `stepDone`). This matches the header at `record.ts:110-113`. It stays correct after `absorb`, because an act this attempt lands itself is no longer `carried`. | `AR/record.ts:623-625` | t869 same-words work. The seed began carrying acts after an achieved attempt and met t870's count room. Before t869 an achieved attempt carried nothing, so this never arose. |
| J | Teach the Flow-less question what a carried act is. Add one generic sentence to `AUTOMATION_STUDIO_FLOW_LESS_QUESTION`, for example: "An act whose words begin 'Already done earlier' or 'May already be done' was done by an earlier attempt at this same request: asking in the same words is not asking for it again, so what it changed counts as got, though it held before." It must stay site-free; `flow-less/tests/judge.test.ts` holds it to that. | `S/runtime/result-verification/flow-less/question.ts` | Judge code, needed by t869: t869 made the words "for a person and a judge to read" and never told the judge. |
| B (secondary) | A carried `heldOnRepeat` set-up press (a quantity stepper) is skipped while the act it sets up may still run. Here that turned "add 2" into "add 1". With A, a landed carried Add is refused, so this is moot here. It still bites when attempt 1 pressed `+` and then failed before Add landed: attempt 2 would skip `+` and add 1. A stepper's own value "rose" is form state, not something that stays on the site. A narrow option: do not count a press as `changedState` when the only line that changed is the pressed control's own field value. This needs a design call, not a one-liner. | `AR/gate/read-answer.ts:82`, `AR/seed.ts:56-64` | t869 (the `heldOnRepeat` rule) |

**Tests that would have caught it (provider-free):**

1. **`AR/tests/seed.test.ts`** (fails today; passes with A): "a carried act whose count has room is refused at every door".
   - Build a record with `asked: () => 2`, settle one landing, seed from `data()`.
   - Then expect `carried({ actionId, parameters: FROZEN, counted: true })` to be defined.
   - Expect `admit(call)` to be `already_done`.
   - Expect `stepDone(call)` to be true.
   - My probe above is this test's body. The existing `begun.test.ts` "carried, counted" cases are within one attempt and stay green.
2. **`AF/tests/same-words.test.ts`** (service, real engine, scripted model, library fixture; never a realistic scenario's words): "the same words after an attempt that met a count with one press do not press it again".
   - Use something like "Reserve two copies of the atlas".
   - Attempt 1's script: press a copies stepper (`consequences: []`), then press Reserve (`modify_existing`, claim `a1`), then complete.
   - Attempt 2 with the same words: expect the fixture's reservations still at 2, no Reserve press in the run, and the result act matching `/^Already done earlier: /`.
   - This needs a stepper on `fake-library` (`AF/tests/fake-library*.ts`).
3. **`S/runtime/result-verification/flow-less/tests/judge.test.ts`** (with J): the question names the carried-act prefixes and still uses no realistic scenario's words.
   - Plus a `completion/tests` case: a check over a record seeded with a landed carried act passes the "Already done earlier: …" act to the judge's summary.
   - What a real judge then answers is a live check, not a unit one.

## Commands run and observed results

- Read the step files 0001-0031 (decisions, judge requests and responses, tool calls and results), `attempt.json`, `attempt-report.txt` and `attempt-*/site.json|answer-turn.json`. `.attempt-work/run-mw4eb5r3-a20f3542/` does not exist: `.attempt-work` is empty, so Core's stores could not be read directly.
- `ls --time-style=full-iso packages/fluxiq/dist` -> built 2026-11-05 19:05 PST. `git log` -> `1bdc15c48` at 17:47 PST. `grep -c heldOnRepeat dist/.../seed.js` -> 2.
- `node scratchpad/probe/asked.mjs` (imports the dist) -> `[{"count":2,"quote":"two packs","act":"a1"}]`, `a1: 2 a1.quantity: 2 none: 2`.
- `node scratchpad/probe/record.mjs` (imports the dist) -> the output in section 3.
- No vitest run, no repository edit, no build, no paid call.

## Not verified

- The persisted act record and task memory themselves. The work stores are gone, so the seed's exact content is inferred from the 0026/0030 notes, the "(2 times)" label and the probe. The inference is tight but not a read of the store.
- The saved Flow's step list. It is inferred from the run's `held` plan (0025) and the flow-run step positions. Position 9 is missing from the run's step list and was not explained.
- That fix A alone gives a judged yes on a real model. It needs J, and J is unproven on a real judge.
- Whether `+` was refused by `carried()` (skipped as already happened) or by another door. The step note says "already done earlier in the task", which is `run-gate.ts:144-148` with `skippedResult`.

## Open questions

1. Fix A closes the count on every carried act. Suppose an attempt 1 of "add 3" is stopped after one press. With the same words, attempt 2 will then not press again: it must reach the count another way (a cart quantity), or the person presses Run again. That follows the record's one-sided rule: doing it twice is what nobody can take back. The alternative, keeping room for a carried count only when the attempt that landed it did not end achieved, brings back a status read the seed dropped on purpose. This is the lead's call.
2. Should a same-words attempt that lands no lasting act still take a before witness at its start? Or should the judge be given the task's first attempt's before witness, so that "judge the change" measures from what the person had before the request first ran?
3. The `+` stepper as `heldOnRepeat` (fix B) needs a rule for set-up presses whose only change is their own field's value.

Outcome: Done
Changed: C:/Users/osrs_/FluxStuff/fxwork/t875/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-a/same-words-double-add.md (report only)
Validation: `node scratchpad/probe/record.mjs` (Core dist) -> carried count act with asked 2 / landings 1: settle run gate "not carried -> pressed", admit {"kind":"run"}, stepDone false; `asked.mjs` -> count 2 for a1
Not verified: Core's persisted stores (work dir empty), the exact saved Flow steps, real-judge behaviour with a carried act
Report: C:/Users/osrs_/FluxStuff/fxwork/t875/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-a/same-words-double-add.md
Notes: Seed and identity were fine; `hasRoom` (AR/record.ts:623) gives a carried count act room in the settle run. The judge question never explains "Already done earlier" and says prior state is no credit.
