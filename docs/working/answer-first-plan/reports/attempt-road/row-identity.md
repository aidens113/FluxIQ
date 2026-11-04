# Row identity: each lasting act lands as often as asked (t869)

Worktrees `fxwork/t869/!FluxIQ` and `fxwork/t869/!FluxIQWebExtension`. `S/` = Core `packages/fluxiq/src`, `SVC/` = `S/framework/automation-service/service`.

## Outcome

**Done, with one limit on the failing proof.**

- **It was a real defect.** Before the fix, a Flow that reshaped a row pressed the first row twice in the real service. So did a Flow with no reshape at all, when the first press itself changed the row. That second case is the likelier one on a real site, and nobody had listed it.
- **It is fixed.** Provider-free, in a visible browser, from the real chat, on `professional-network-accept-messaged-invitations`, both the plain and the reshaping Flow came out right: each of the three acts landed once, and the first row was not sent again.
- **The limit.** No per-row task the Lab has can show a repeat as a repeated act, because each site keeps those acts as a set or a toggle. So the run that says "wrong, repeated act" is on a task with a counted cart line, reported below as what it is. On the per-row task, the fix-out run shows a different failure, also below.

## Did the reshape press again before the fix?

**Yes.** Core test `SVC/answer-first/tests/row-identity.test.ts`, run before the fix existed:

```text
Atlas of Rivers: 2 presses, 1 each for the other two, in 6 of 8 cases
pressed twice:     renamed columns, fewer columns, a trimmed field, a derived field, a field the read had not, a row the act itself changed
not pressed twice: a different column order, and the plain row-bound repeat
```

The cause: a row's identity is a digest of its own fields (`act-record/identity/row-identity.ts`), so it only holds while the row reads the same. The hand press was noted under the read's row, and the pass carried the Flow's row. Neither `rowDone` nor `admit` could tell them apart, so the row counted as not done. Column order was already safe because the digest sorts keys.

With the fix taken out on the final code, the same file gives `9 failed | 4 passed`. With it in, all 13 pass.

**In a browser, the same defect looks different.** With the fix out on the reshaping form, Core really did send a pass for the first row: `forward.9.pass.1`, pass 1 of 3, row "Ximena Ruiz". It landed nothing, because the row's Accept had gone. The page refused after 29 s with "the step's target matched another row's control", and the forward run stopped there with `0 done, 0 skipped, 1 failed`. So this site did not act twice, but the whole forward run was lost at its first row. A site whose control stays would have taken the second press.

## The rule now

The code is in `S/runtime/answer-first/act-record/same-row.ts`, `row-ties.ts` and `record.ts`. The rule is in `docs/architecture/automation-studio/llm-flow-bootstrap.md`.

1. A row answers to its own digest and to the digests of any rows earlier reads noted as the same row. Its act's id and `rowIdentity` stay the row's own.
2. **Two rows of one read are never the same row.** Reads are now counted on each noted row, keeping the newest eight. Evidence rows and output rows of one answer count as separate reads, because they can write one row two ways.
3. Otherwise, per earlier read, the row that fits best is that row. Rows that fit equally are all held, which is the bias in `row-ties.ts`.
4. A fit needs a field the row can be told by, whole enough (60% of its words) and holding a word with a letter or a number of six or more digits, found anywhere in the other row whatever the column is called. A shared address also fits.
5. A field more than one row of a read holds ("Pending" on every row) tells no row apart. Bare numbers only decide between rows that already fit.
6. A later read is also held against the sentence that named the hand press, so a read of quite different columns can still find its row. Here a word most of that read shares does not count.

All of it stays hashed. Older records without read counts still parse. `admit`, `rowDone`, `stepDone` and `carried` all read the same rule, so a real run's `rowOf(request.inputs.item)` is covered too (a new case in `run-gate.test.ts`).

**Other modes:** nothing in `run-acts` changed, only a test was added. The record is only built for answer-first attempts or read from a saved attempt's file.

**Genuinely different rows:**

| Case | Result | Why |
| --- | --- | --- |
| "Birds of the Coast" and "Birds of the Marsh", read dropped a column | Kept apart, pressed once each | Best fit decides |
| Two rows of one read differing only by a date, same shape | Kept apart | Rule 2 |
| Two copies of one title, and the Flow's read dropped what told them apart | **Merged, on purpose** | The bias: the second copy is left out, and the forward run says `1 done, 2 skipped`. Never pressed twice |

## What a reshape can still get wrong

- **It can press twice:** a Flow's row sharing no word with any read or the hand press's sentence reads as a new row. There is a test for this limit.
- **It can press twice:** a one-word field cut inside its word ("Clockmakin…"), since a hashed word has no prefix to compare. Cut on a word boundary is fine.
- **It can leave a row out:** a different row sharing 60% of a field's words with the done row, when that row is missing from the earlier read. A row with only a shared plain word also fits when the first read held one row and nothing marks that word as common, as on a real run's rows, which are never noted as a read.
- **Telling is thin.** A row left out shows only as a count in the forward run's answer, which the model reads. The person's card does not say rows were skipped, and nothing says which row. The counts live in `S/runtime/llm/node-tools/replay/`, outside my paths.

## Browser runs

Every command is `pnpm lab attempt <scenario> --task <task> --authoring-mode answer-first --scripted-model`, with `FLUXIQ_ATTEMPT_SCRIPT_FORM` choosing the form. Evidence folders are under `fxwork/t869/!FluxIQWebExtension/test-runs/attempts/`.

**The proof, on the final code:**

| Run | Form | Exit | Result line | Evidence |
| --- | --- | --- | --- | --- |
| Plain | `plain` | 0 | `attempt 1: answer right. Ended achieved, 3 rows stored, 3 shown, 13 live steps, 13 calls, $0.5037, 37 s. NOT LIVE, stand-ins: model, spend.` | `run-mw2gwfyj-e316ee24` |
| Reshape | `reshape` | 0 | `attempt 1: answer right. Ended achieved, 3 rows stored, 3 shown, 14 live steps, 14 calls, $0.5488, 38 s. NOT LIVE, stand-ins: model, spend.` | `run-mw2gzev6-99a92065` |

Both score: records held, final state held, change held, shown held, `repeatedActs` empty, `missingActs` empty, `unaskedChanges` empty, flow unproven. The chat's rows, read from the DOM (`answer-turn.json`), are Ximena Ruiz, Lucia Romano and Chidi Nwosu, each with their exact message, in the oracle's order. I read both proofs' pictures (`answer-turn.jpg`). The panel is scrolled to the turn's tail: the last row's message, then CSV and JSON, "On the site" with one generic line and "Accept" twice, "3 rows, 3 acts on the site", "Took 37s · $0.50" and "Took 38s · $0.55", "Saved, and it partly works", and "Running this again may repeat what was done on the site". The upper rows are scrolled off in the picture and are in `answer-turn.json`.

**How I know the forward run really ran and pressed the others, not the script.**

- The script presses one row by hand: `accept-first`, step 16 of Core's log in the plain run and step 14 in the reshape run. The step log holds no other press on an invitation outside the forward run. (The cookie banner's own Accept is also in the log.)
- The reshape proof's step log, `steps/`: `forward.9.pass.2` row Lucia Romano, and `forward.9.pass.3` row Chidi Nwosu, each with result `core.replay.replayed` and an item carrying `person, note, headline`. There is no pass 1. The plain run has the same passes, as `forward.8.pass.2` and `.3`.
- The first read kept `name, message`, so the row a pass carried really differed from the read.
- The forward answer the model got: `Rows: 2 done, 1 skipped as already done, 0 failed.`
- The site's own record, `site.json`:

```text
before  {}
change  accepted:...6981004 +1, accepted:...6981295 +1, accepted:...6981586 +1
activity  consent accepted, accepted ...6981004, accepted ...6981295, accepted ...6981586
```

**What this site cannot show:** its server ignores a second accept, and the row's button is gone by then. So on this task the site state alone would hold even with a double press. The step log and the fix-out run are what prove the first row was not sent.

**The body is row-bound through the pass's row, not through a `$row` parameter.** A web press has no parameter to bind: Core sends the row as `item`, and the page accepts the control only inside the record holding the row's values. `$row` parameters are proved in the Core test.

**Runs that show the proof can fail:**

| Run | What it is | Exit | Result | Evidence |
| --- | --- | --- | --- | --- |
| Fix out, per-row | The reshape form with the fix removed from Core, rebuilt, then restored | 1 | Not judged: the forward run stopped at row 1 as above, and my script refuses to carry on past a run that did not pass | `run-mw2fu74l-235889e0` |
| Counted act | `everything-store-batteries-and-descaler`, with a script that adds the descaler, then presses its cart line's Increase, both undeclared | 1 | See below | `run-mw2haj1y-96abb1b5` |

```text
attempt 1: answer wrong because records, final_state, repeated_act, not_shown. Ended achieved, 3 rows stored, 3 shown, 8 live steps, 9 calls, $0.3150, 24 s. NOT LIVE, stand-ins: model, spend.
repeatedActs: [{ name: "One descaler added to the cart", asked: 1, landed: 2 }]
site change:  cart:B0TWDESC04:own +2, cart:B0BAAA48CT:own +2
```

Read it for what it is. This run is **not** a row identity failure and not a per-row task. It proves `lab attempt` says wrong with a repeated act, on the site's recorded state, even though the script's judge said yes. Part of `records` and `not_shown` is my script picking the link field for the item column, which does not change the repeated act. The presses are undeclared on purpose: that is the record's disclosed limit (plan D6), so the oracle is the only thing that could catch them.

**Why not a per-row repeat:** I read each per-row site's state and client code. Confirm, accept, hide and withdraw ignore a repeat. Watch, follow, like, the classifieds' save and the job board's heart toggle, so a second press undoes the first, which the oracle reports as a missing act, not a repeated one. I did not run a toggle site. Doing so would be the strongest remaining proof of a double press landing. The job board's heart looks the likeliest, because its control keeps its words after the press, and its first press is swallowed by design.

**Permission:** this task asked nothing. The hand press and the passes declared `modify_existing`, which needs no person. No PIN and no repeated ask appeared, so the driver's wait for a person was not exercised and I did not add the Lab's person to it.

**Other runs along the way:** the rest were script discovery, each stopping on my script's own defects (a wrong page-reading helper, a cookie rule that pressed the invitations' Accept, a row search that crossed into the next row, a first descaler script with nothing to judge). One timed out under my own wrapper before the browser opened, and one failed on a Core edit made during the web build. Two plain runs and one reshape run on earlier builds were also right. Those that reached a browser are in the same folder.

## What changed and why

**Core:**

- `S/runtime/answer-first/act-record/same-row.ts` (new): the rule above.
- `row-ties.ts`, `record.ts`, `contracts.ts`, `record-data.ts`: read counts and common-field marks, `sameAs`, ties to later reads, and an act keeping its own row's id.
- `gate/read-answer.ts`, `gate/act-gate.ts`: one read per place the answer holds rows.
- `act-record/tests/same-row.test.ts`, `SVC/answer-first/tests/row-identity.test.ts` (new), a case in `run-acts/tests/run-gate.test.ts`, additive options in `tests/fake-library.ts`.
- `docs/architecture/automation-studio/llm-flow-bootstrap.md`: the identity rule.

**Extension (`packages/test-runner/src/attempt-lane/`):**

- `scripted-model/scripts/professional-network-accept-messaged-invitations.ts`, with forms `plain` and `reshape`.
- `scripted-model/scripts/everything-store-batteries-and-descaler.ts`: the script that means to fail.
- Tests for both, and `scripts/index.ts` taking a form from `FLUXIQ_ATTEMPT_SCRIPT_FORM`. `lab attempt` has no such option, and `commands.ts` is not in my paths.
- `scripts/evidence.ts`: `currentPageOf` also reads a page held inside a whole answer. It was refusing real requests.
- `live/live-driver.ts`, `live/run-attempt-command.ts`: each run now writes `site.json` with before, after, change and the site's activity.

No oracle, fixture, instruction, guidance or attempt code was touched.

## Commands run and observed results

```text
(packages/fluxiq) npx vitest run src/runtime/answer-first/act-record src/framework/automation-service/service/answer-first/tests/row-identity.test.ts src/framework/automation-service/service/answer-first/tests/attempt.test.ts src/framework/automation-service/service/answer-first/run-acts --minWorkers 1 --maxWorkers 2
  Test Files 11 passed (11)   Tests 158 passed (158)
Fix out, same row-identity file:   Tests 9 failed | 4 passed (13)
pnpm.cmd --filter fluxiq check     exit 0
(Core) node scripts/structure-audit.mjs       structure-audit: passed (494 warning(s), 1097 baselined).
pnpm.cmd --filter @fluxiq-web-extension/test-runner check     exit 0
(Extension) node scripts/structure-audit.mjs  structure-audit: passed (237 warning(s), 553 baselined).
node scripts/check/core-mirror.mjs            1 mirror set(s) match
(packages/test-runner) node --test on nine dist/attempt-lane test files, including both new script tests
  # tests 49  # pass 49  # fail 0
Win32_Process filtered on t869 after the last run: left over: 0
```

The browser runs are in the tables above. Both proofs ran after the fix was restored and everything rebuilt.

## Not verified

- **Any real model.** A script made every choice. It proves the road and the record, not what a model would write.
- **A second press landing on a per-row site.** No toggle site was run.
- **A real run of a saved Flow after an attempt, end to end.** The reshaped row is held through the persisted record and the run gate in tests with a real engine, not through an applied Flow in a browser.
- **A permission ask inside this lane**, since this task has none.
- **Derived and trimmed fields in a browser.** The web read has no such shape, so only renamed columns, fewer columns and an extra column are exercisable there. The others are Core tests only.
- **Firefox**, and a second attempt.
- **The whole-package suites**, per the narrow-check rule. I ran `S/runtime/answer-first/act-record` and `run-acts` whole, plus two service test files, but not the other answer-first files in `SVC/answer-first/tests/endings/`.

## Open questions and contradictions

1. **Your brief asked for "wrong with a repeated act" on a per-row task, and no such fixture exists.** I gave the nearest honest pair above. Adding a counter to a fixture was outside my brief, and changing one to pass was forbidden.
2. **Defect: the chat says "On the site: nothing changed" when undeclared presses really changed the site.** It is in `run-mw2haj1y-96abb1b5`'s picture, with the cart at 2 descalers and 3 batteries. Those presses are left out of a result's acts by design (D6), but the sentence claims more than the record knows. It is in the card's words, in `packages/ui-components` or where the result's site lines are made, outside my paths. Suggested wording: "No act was recorded".
3. **Minor: the card's first act reads "Changed something that was already there", beside "Accept" for the others.** A hand press answers with no words of its own, so the generic line by class stands in. The seam is `wordsOf` in `SVC/answer-first/attempt/call-chain.ts`, the other lane's.
4. **The extension's `docs/architecture/testing-facility.md` does not mention `FLUXIQ_ATTEMPT_SCRIPT_FORM` or `site.json`.** It is outside my paths, and one line would do.
5. **A Core source edit while `lab attempt` is starting fails the run**, with "Core's build inputs changed while the web panel was building". That is correct behaviour, but it cost me one run, and it matters for anyone sharing a worktree.
6. **Minor: a forward run's chat steps read "Testing: Click · Accept · Ximena Ruiz"** (`run-mw2fu74l-235889e0/stopped.jpg`). A forward run is the work and not a test, as its own heading "Running the rest of the Flow" says. The same picture's "Waiting for the model service" is my script refusing the next request, not a product fault.
