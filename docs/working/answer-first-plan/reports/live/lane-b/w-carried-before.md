# w-carried-before: carry the earlier attempt's before reading with its carried acts (unsure-loop D2)

## Outcome

Done. When a later attempt carries an earlier attempt's acts ("Already done earlier"), its judge now sees the
same before reading the earlier attempt's judge saw. If that reading is not held (for example after a Core
restart), the judge is told that an earlier attempt took it, and no reading is presented as one from before
the acts. The reading is page text, so it is kept **in process memory only**. Nothing new is persisted, and
none of it goes into the act record or the task's memory, which persist beside a Flow.

## What changed and why

Core tree `fxwork/t876/!FluxIQ/packages/fluxiq/src/framework/automation-service/service/answer-first/`:

- `witnesses/before-readings.ts` (new): `automationStudioAnswerFirstBeforeReadingsOf(owner)`, one in-memory
  store per service in a WeakMap (the same pattern as `interrupted/live-attempts.ts`). It holds the before
  reading for each attemptId, up to 32 of them, and drops the oldest first. It never writes to disk.
- `witnesses/earlier.ts` (new): `automationStudioAnswerFirstEarlierBefore(readings, { acts, from, sameAttempt })`
  decides what a new attempt's witnesses start from:
  - It carries one attempt's acts: that attempt's reading if it is held, otherwise `{}` (tell the judge).
  - It carries a union (a Run again's set-aside acts plus the newer ones): `{}`, because no single reading
    came before both.
  - A carry-on (the same attempt): its own reading if held, otherwise nothing is said.
  - Nothing is carried: nothing changes.
- `witnesses/earlier-words.ts` (new): `AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_BEFORE_WORDS` holds two lines:
  - `notHeld`: no reading of the before side was taken.
  - `takenAfter`: this attempt read its own before side, after the carried acts.

  Both are generic and name no site, task or thing.
- `witnesses/input.ts:7-15`: two optional fields, `earlier?: { before? }` and `keep?(before)`.
- `witnesses/witnesses.ts`:
  - New header paragraph at :12-18.
  - :39-51: a seeded `earlier.before` becomes the before side and the settled `before` read, so it is never
    read again, and it is passed to `keep` under this attempt's id.
  - :65: a fresh before read goes to `keep` only when nothing was carried in. A reading taken after carried
    acts is never stored as a "before".
  - :77 and :83-87: `readings()` goes through `shown()`. When acts were carried in without a reading, `before`
    is `{ note: notHeld }`, or `{ note: takenAfter, reading: <this attempt's view> }` once one is read.
  - Return values of `beforeFirstLastingAct()` and `atEnd()` are unchanged.
- `witnesses/index.ts:2-4`: exports the new parts.
- `attempt/opening.ts`:
  - :17: one header line.
  - :49: new field `seedFrom?: string`.
  - :73: `seed: carried?.data, seedFrom: carried?.from`. A Run again still gets `setAside: carried?.data`.
  - :102-117: `seedOf` now returns `{ data, from? }`. `from` is the task-memory `acts.attemptId`, or none when
    `acts.earlier` is present (a union), or the Flow-record fallback's `last.attemptId`. New helper `seeded`.
- `attempt/run-attempt.ts` has 3 lines added and 2 modified:
  - :53: the import.
  - :133: the carry-on literal gets `seedFrom: attemptId`.
  - :171-174: build `befores` and `earlier`, then pass `earlier` and `keep: (before) => befores.keep(attemptId, before)` to the witnesses.

Tests:

- `witnesses/tests/witnesses.test.ts`: 4 new cases.
  - A seeded before reading is returned with no read (`reads` only `["after"]`) and kept again.
  - With no earlier reading, `{ note: notHeld }` is shown, then `{ note: takenAfter, reading }`, and nothing is kept.
  - With nothing carried, behaviour is unchanged and the reading is kept.
  - A `keep` that throws costs the reading nothing.
- `witnesses/tests/before-readings.test.ts` (new): the store is per service and its bound evicts the oldest.
  It also covers every case of `EarlierBefore`.
- `attempt/tests/carried-before.test.ts` (new): runs through the real service, the real engine and a scripted
  model at the fake lending library (`../../tests/later-attempts.ts`), with no provider.
  - Attempt 1 presses the card. Its judge sees `witnesses.before = { page: { heading: "Your account", renewed: 0, ... } }`.
    Every judge call in attempts 2 and 3 sees exactly that reading, and the card is pressed once.
  - The same holds when attempt 2 runs under another Flow (the chat makes a new Flow each time, as in the
    evidence run).
  - After a restart (a new service over the same data), every judge of attempt 2 gets `notHeld` or
    `takenAfter`, never attempt 1's reading. Any reading it holds shows `renewed: 1`, which is after the act.
  - Page text: the judge's before holds "Your account". The Flow's act record (`actsOn()`), the task memory
    (`kept()`) and every `attempt-acts.json` or `task-memory/**.json` file on disk under the data directory
    do not contain it.

## Page text and persistence

A before reading is an end view: `automationStudioEndViewLook`, the domain's page view (in the test, the page's
heading). So it holds page text. The brief allowed keeping it on the same thread's attempt record. I did not do
that, for three reasons:

- The attempt record lives in `attempt-store/`, which I do not own.
- Its strict reader (`attempt-store/store.ts:156-174`) rebuilds each record from known fields, so a new field
  would be dropped on read unless that file changed.
- It is written by `keep.ts` and `ending.ts`, which I also do not own.

Holding the reading in memory persists nothing, which is stricter than the brief required. It covers the
evidence case: attempt 2 started in the same process right after attempt 1 (0039 is attempt 2's opening note,
0040 its first step). After a restart, the judge is told plainly that the reading was taken by an earlier
attempt and is not held. The act record and the task memory are untouched and still carry no page text, and the
new test asserts that on disk.

## Commands run and observed results

From `packages/fluxiq`:

- `npx vitest run --maxWorkers 2 --minWorkers 1 src/framework/automation-service/service/answer-first/witnesses src/framework/automation-service/service/answer-first/attempt src/framework/automation-service/service/answer-first/carry-on`
  - First run: 3 failed / 13 passed. Two were test mistakes: the view is nested as `{ page: {...} }`. One was a
    real bug in my code: a shadowed `earlier` inside `once()` made a reading taken after the carried acts get
    kept. I fixed it by renaming the outer variable to `carriedIn`.
  - Final run: `Test Files 17 passed (17)`, `Tests 71 passed (71)`. This includes `carried-before.test.ts (4 tests)`,
    `witnesses.test.ts (6 tests)` and `before-readings.test.ts (6 tests)`. The `attempt` path filter also matches
    `attempt-store` and `attempt-in-flight`. `carry-on/` has no tests.
- Extra narrow check, because `opening.ts`'s seed shape changed:
  `npx vitest run ... answer-first/tests/later-attempt.test.ts answer-first/tests/same-words.test.ts answer-first/tests/carry-on.test.ts answer-first/tests/saved-read-restart.test.ts`
  -> `Test Files 4 passed (4)`, `Tests 55 passed (55)` (407s).

## Not verified

- No typecheck, whole-package run or structure audit, as the brief instructed. vitest does not typecheck. I read
  the types by eye:
  - The union access to `opening.seedFrom` is made safe by adding `seedFrom` to the carry-on literal.
  - `Promise.resolve` is explicitly typed.
  - The test uses `readdir(..., { recursive: true })` returning strings, not `Dirent.parentPath`.
- No live run. Whether a live judge reads `{ note }` in the `before` slot as intended is untested.
- `run-attempt.ts` grows by 3 lines. I did not check it against any line budget.

## Open questions or contradictions

- **Lane A wording.** `question.ts:15` (lane A) still says "witnesses.before ... taken before the first lasting
  act". The note's words override that in the case it covers. A one-line mention in `question.ts` would make it
  explicit, but that is lane A's file.
- **Restarts.** For a reading to survive a restart, the attempt record would need a screened `before` field.
  That needs a change to `attempt-store/record.ts` and `store.ts` (its strict reader), and to `keep.ts` (writing
  it). The supervisor should decide whether that is wanted. Today, a restart yields the honest note.
- **Carry-on with nothing held.** A carry-on whose reading is not held (after a restart) behaves as before: a
  fresh before read after its own earlier acts, with nothing said about it. Its acts are its own, not
  "Already done earlier", so the `notHeld` words would be wrong there.
- **Dirty files from others.** `git status` shows changes to `call-chain.ts`, `completion/check.ts`,
  `completion/refused-words.ts`, `flow-less/types.ts`, `attempt/tests/looked.test.ts` and
  `completion/tests/looked-evidence.test.ts` in the tree. They come from other workers. I did not touch them.
