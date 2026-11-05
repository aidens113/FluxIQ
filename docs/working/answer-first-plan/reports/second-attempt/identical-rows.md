# Identical rows, the skipped count and the two limits (t870)

`AF/` = `packages/fluxiq/src/framework/automation-service/service/answer-first/`. `AR/` = `packages/fluxiq/src/runtime/answer-first/act-record/`. `LD/` = `packages/fluxiq/src/runtime/llm/repeat-guard/loop-detection/`.

## Outcome

Done, provider-free. All three requirements are met and the tree passes its checks. Nothing is committed; I ran no git.

## What I found whole and what I finished

The stopped work was nearly whole, with one thing wrong. The gate's header promised that a by-hand "already done" answer names its act through `ranWith`, but the code never sent one. Each refusal by a new handle therefore looked like a new call, and the detector saw no repeat. That one line (`AR/gate/act-gate.ts`, `ranWith: { act: act.id }`) turned all four failing ladder tests green.

I finished or corrected these:

| Where | What and why |
| --- | --- |
| `LD/detector.ts`, `LD/watch.ts` | The stopped work judged a call with no page in every mode, which could change how an old mode ends. It now applies only where `refuseActs` is on, the same line that separates the new path. Pinned both ways. |
| `LD/row-digests.ts` | The pattern read `/^$\|handle\|evidence/`: `^$` matches an empty key, and `^\$` was meant, as in the act record. Fixed. A row holding nothing but such a field keeps it, so a list of people's handles still reads as new rows. |
| `AR/record.ts`, new `AR/rows-left-out.ts` | The count fixes below. I moved the count into its own small class, because the record was one method short of the audit's 40-method line. |
| `AF/tests/identical-rows.test.ts` | Budget cut to $0.08, so unseen refusals really end `budget_out` inside the script. The read in the "reads and presses" test now varies, because an identical read is answered from memory and proved nothing about minted handles. New rows raised to 14, past the 12-call no-progress window. |
| `AF/tests/skipped-rows.test.ts` | Rewritten (see "What the count really reads"). |
| Extension test | Moved to `node-run/tests/labelled-press/tests/identity.test.ts`, and its spreads removed. As left, it failed the Extension's audit on the directory file limit and on `contract-spread`. |

`AF/tests/identical-rows-probe.test.ts` no longer exists. My own scratch probe is deleted too.

## The ladder's sequence, and the money left when the person is asked

Observed with a scratch probe on two loans of one title, then the same row pressed by a new handle every time. Budget $1, each paid call about $0.001.

| Decisions | What happens |
| --- | --- |
| Read, then press 1 | The read runs, and the press lands. |
| 2 to 3 | Refused by the gate. The second refusal is a near repeat, so the model is steered. |
| 4 to 7 | Still refused. Findings pile up, and the fourth of these signals a change of approach. |
| 8 to 13 | A fresh round. Same pattern, second change of approach. |
| 14 to 19 | A fresh round. Same pattern, then **ask the person**. |

- **At the ask:** `waiting_for_person`, `stuck_in_a_loop`, one press on the row, 21 paid calls, **$0.021 spent of $1**. The attempt's `loopsCaught` for near repeats reads steered 6, change approach 2, ask person 1.
- **While waiting:** nothing is asked of the model. A Stop ends `stopped_by_person`, and keep going carries on with the same budget.
- **Scaled, calculated and not observed:** at $0.02 a call on a $5 budget, that is about $0.42 spent and $4.58 left.
- **Pinned:** the service test holds spend under half of $0.08 at the ask, with at most 30 decisions. A model that reads between presses also stays under half.

The model is told what would help in `ROW_UNCLEAR_SAID`: read something that tells the rows apart, or say what you have. The words are generic.

**Rows that really are new:** 14 rows, each pressed by a new handle, reach the result with steered, refused, change approach and ask person all at zero.

## What the count really reads

**Both the guess and the count were wrong.**

On the earlier test's own script, the second attempt read `skippedAsDone` absent. The route was `use`, so the saved Flow ran before any model decision. It left both landed presses out and the judge's default yes ended the attempt. Only two loans were ever renewed, and the scripted `press(CLOCKS)` and `press(DUNES)` were never reached.

- **The count was wrong here.** Those saved steps carry no row of their own, so `carried` counted nothing, even though each act was on a known row. A step now counts the row its act was on, on a Flow run, a forward run and by hand. This script now reads 2.
- **The test was wrong too.** It needs a judge's no before the model is asked at all. With that, the second attempt reads `skippedAsDone: 2` and every loan is renewed once.
- **Two rows nothing separates:** a forward run over two value-identical rows now reads `skippedAsDone: 2`, the same number the model is told by count (`"skipped":2`). Before, they were one identity and would have read 1. Each copy counts once, however many times a run goes over the list. A press refused on such a row is one row left out.
- **A press that goes after a look** is no longer counted as left out.

What it means: rows this attempt left out because the record held them done. A model that keeps away from done rows by itself left nothing out as far as Core can know, so it gets no count, though the card's acts still list them. That case is pinned.

**Two things a person may read oddly:**

1. An ordinary first attempt that does row one by hand and runs forward over the list reads "Skipped 1". This was observed. It is true, since the forward run did pass over that row, but this attempt pressed it itself. A record test the stopped worker wrote expects this, so I left it. See "Open questions".
2. On a Flow run, the record sees no read, so two value-identical rows read as 1. The card still says a row was left out, but the number is low. Pinned at record level.

## The two limits

The answers are in `closing-holes.md`, "Checked afterwards".

- **`web.recovery.press` is not reachable on this path.** The option is pinned to the stages `gather` and `iterate`, and the attempt names no stage in its first or later rounds. Nothing needed fixing. The test uses a library's option of the same shape through the real service, not the web bundle itself.
- **A labelled control was reachable and could press twice. It is now closed by `placeKeys`.** The real runtime test shows a thinner foreseen identity than the press ran with, at the same address, and the record test feeds in those shapes. Still open and pinned as a known limit: a label that a later look loses, at an address that counts places.

## Commands and observed results

Core, from `packages/fluxiq`:

- The brief's vitest command -> exit 0, `Test Files 117 passed (117)`, `Tests 1416 passed (1416)`, 435 s. Its one later change is a comment in `AR/tests/identical-rows.test.ts`; that file was rerun alone -> `Tests 25 passed (25)`.
- Neighbours: `vitest run src/runtime/llm/decision-handlers src/runtime/answer-first/guidance src/runtime/llm/node-tools/run` -> `Test Files 22 passed (22)`, `Tests 102 passed (102)`.

Core, from the worktree root:

- `pnpm.cmd --filter fluxiq check` -> exit 0, 0 `error TS`.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (502 warning(s), 1097 baselined).`
- `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build` -> exit 0.

Extension:

- `pnpm.cmd --filter @fluxiq-web-extension/domain check` -> exit 0, 0 `error TS`, after `core-build: ... is current with its source.`
- From `domain`: `DOMAIN_TEST_BUILD_LABEL=t870-identical node scripts/test-domain.mjs node-run/tests/labelled-press/tests/identity node-run/tests/call-words` -> `# tests 15`, `# pass 15`, `# fail 0`.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (235 warning(s), 553 baselined).`

Mutations, each applied by script against the named tests, with the file compared and restored after each run (`restored=true`):

| Mutation | Tests failing |
| --- | --- |
| Gate names no act (run on one named test) | 1 |
| No-page calls never judged | 4 |
| No-page calls judged in every mode | 1 |
| Minted fields kept in a row's digest (run on the service test) | 1 |
| A step with no row counts no row | 2 |
| Copies not counted | 2 |
| A row pressed in the end stays left out | 1 |
| A labelled control's foreseen form not kept | 1 |

The gate mutation first ran against the whole file and hit my 280-second limit with no summary, so I reran it on one test. "A labelled control's foreseen form" and the four loop mutations were not rerun after the count moved to `AR/rows-left-out.ts`; those lines did not move.

## Not verified

- **A page whose digest keeps changing, by reading only.** A near repeat is one call on one page, so a page with changing content (a ticking clock) gives each refusal a new page key. New page states also count as progress and reset the no-progress window, so such a model could still spend its budget on refusals. This is the main remaining risk to requirement 1. The limit already applied to every near repeat, and I did not test it.
- **New rows with no page change, by reading only.** A press that lands and leaves the page digest unchanged is not progress, so more than 12 such rows in a row would be steered by the no-progress window. This was already so. The test's fake page changes on every press.
- **A carried-on attempt, by reading only.** Each segment builds a new record, so the count starts over and rows left out earlier drop off the card. Fixing it needs `prior`, which is built outside my paths.
- **Not run:** the `ui-components` tests. I changed nothing there, and the earlier worker's card tests stand as that worker reported them.

## What is only scripted

The model, the judge, the Core fake's `describeCall` and the library are scripts. The Extension test is the real runtime with a fake gateway. No Lab, browser, real site, key or paid call was used. How a person's chat shows the ask and the card line was not exercised here.

## Open questions

1. Should "Skipped N" leave out rows this same attempt pressed itself? It would make an ordinary first attempt read nothing, and two identical rows read 1. I left it, because the brief says the field is filled from `rowsHeldDone()` and a test pins it, and changing what the count means is your call.
2. A page that keeps changing, as above: should repeated refusals of one act be caught whatever the page does, as `same_act` already is for landings? It looks like a small change, but it adds a new rule to the ladder, so I did not add it unasked.

No test of another feature disagreed with this work. Tests I changed beyond the three named files: one assertion added in `AR/gate/tests/act-gate.test.ts`, and new tests in `LD/tests/detector.test.ts` and `AR/tests/identical-rows.test.ts`.

Report: docs/working/answer-first-plan/reports/second-attempt/identical-rows.md
