# Merge of dev into t870

`AR/` = `packages/fluxiq/src/runtime/answer-first/act-record`. `AF/` = `packages/fluxiq/src/framework/automation-service/service/answer-first`.

## Outcome

**Done, provider-free.** No conflict markers remain, and every test of both lanes passes. No existing test was edited, and no two tests contradicted each other. Nothing is staged, and I ran no git.

**The lead should read two things.** `same-row.ts` gained one clause (decision 1). One way of pressing twice stays open, because a t870 test requires it (decision 2).

## Where the two sameness rules became one

`AR/same-row.ts` is the only rule. In `AR/row-ties.ts`, `sameAs`, `sameAsHeld`, `toldApart`, `fitsOf`, `distinct` and `ofControlWords` all go through one private `sameOf`, which calls `automationStudioAttemptActSameRows`. The `sameRow` and `valuesOf` the merge left behind in `row-ties.ts` are gone; they stay private in `same-row.ts`, which exports one new helper for rule 4 alone (see `sameAsPrinted` in decision 2).

## How each conflict was resolved

| File | Resolution |
| --- | --- |
| `AR/record.ts`, header | dev's "One row, several shapes", plus this lane's sentence on a press by a printed handle. |
| `AR/record.ts`, `rowDone` | t869's `sameAs(row)` and dev's quick return, with this lane's `namesAnotherRow` and `leftOut.passedOver`. |
| `AR/record.ts`, `noteReadRows` | dev's widening by `actedOnWords` within a read, plus this lane's `leftOut.noteList`. |
| `AR/record.ts`, `identityOf` | Both sides needed a merged `Identity` (below). |
| `AR/gate/act-gate.ts`, `AR/gate/read-answer.ts` | dev's `reads`, one list per place an answer holds rows. |
| `AR/row-ties.ts` | t869's pointer to `same-row.ts`, plus this lane's `ofControlWords` paragraph. This lane's `sameAs` paragraph is replaced by `same-row.ts`. |
| `AR/index.ts` | Both exports. |
| `AF/attempt-store/record.ts` | This lane's `steps` comment. |
| `packages/ui-components/src/chat/answer/view/body.ts` | Both lines: missing, checked, skipped, how, compared, from. |
| `docs/architecture/automation-studio/llm-flow-bootstrap.md` | Both sections, plus two sentences in the rule's paragraph for decisions 1 and 2. |

**Changes that follow from these:**

- **`listed` and `oneList` are gone.** Each list is now noted on its own, so a row said twice across two lists no longer reads as two copies. Copies are counted per list, which is what `listed` was for.
- **`Identity` now has `rows` and `named`, replacing dev's `ownRow` and this lane's `sameRows`.**
  - `rows` holds every shape, and is what `matches` reads.
  - `named` holds what the call itself says it is on, and is what `pressedRows`, `rowsUnclear` and an act's `rowIdentity` read.
  - Without this split, any row with a second shape would have read as "several rows fit".
- **`rows-left-out.ts`, `ranOn`:** an act keeps all its shapes now, so "one row" is decided by `ties.distinct`. Otherwise a row pressed after a look would stay counted as left out.
- **`distinct` keeps the row with the fewest ties first.** My first version kept rows in list order, so `{a1, zz, yy}` read as 1. It now reads 2, and a short row that fits two long ones still counts as those two. The new record test caught this.

All of the lead's named items are kept: `begun`, `foresee`, `foreseen`, `looked` after a refusal, `placePath`, `placeKeys`, `rowsUnclear` and its words, `rowsHeldDone` with `rows-left-out.ts`, a by-hand "already done" with no `ok: false` and with `ranWith`, and t869's rule with elimination.

## Decisions for the lead

**1. `same-row.ts` gained one clause, in `fitOf`, because t869's rule alone pressed twice.**

- **The gap:** an act on `{title}`, then a read of `{title, wing}` rows that all hold that title. The title is common in that read, so rule 3 did not tie them.
- **Evidence:** on the plain merge, two t870 tests failed: `AR/tests/identical-rows.test.ts`, "a run's act in a shape that fits two" and "a press with the act's own key".
- **The clause:** a row all of whose values lie in another may be that row, whatever the other's list shares. It runs only where the fit would otherwise be 0.
- **Why it is not a contradiction:** t869's "a word every row holds ties nobody" tests still pass, because their rows have other fields of their own. The clause only ever holds more rows done.
- **Cost, observed:** an act on `{action: "Accept"}` alone holds every later row with "Accept" done, `[true, true]`. Those rows are left out and counted, never pressed twice.

**2. One way of pressing twice stays open, because a t870 test requires it.**

- **The test:** `AR/tests/row-shapes.test.ts`, "does not hold another row's printed handle as done". An act on `{The Long Winter, Ann Lee}` that no read showed, then a printed handle on `{Old Roads, Ann Lee}`, must run. The whole rule would refuse it.
- **What I did:** a new `sameAsPrinted` in `row-ties.ts`. For a printed handle, a row no read has shown is compared by values alone (rule 4). A row a read has shown still gets the whole rule.
- **What remains:** `{Atlas, Waiting}` acted on with no read showing it, then a printed handle on `{Atlas, Accepted}`, reads `run`. It has the same shape as the test's case, so no rule can tell the two apart.
- **How far it reaches, by reading:** the header of `row-ties.ts` says web rows print no handle today, so I expect the web domain cannot reach this. I did not test that.
- **Closed on the other paths, observed:** the same act by foreseen words reads `already_done`, a pass on the row is held done, and an act a read did show reads `already_done`.
- **To close it:** that test would have to change, which is yours to decide.

## The skipped count and elimination

**The existing test never reaches elimination.** "Two rows nothing separates" in `AF/tests/skipped-rows.test.ts` uses value-identical rows, which share one digest and go through the copies path. With elimination switched off it still passes.

**I added two tests, and elimination counts correctly in both:**

- **Service:** `AF/tests/skipped-rows.test.ts`, "nor can two rows the press may have become". The press changes its row, another row arrives, and two rows are left over. Each loan is renewed once, the model is told `"skipped":2`, and `skippedAsDone` is 2.
- **Record:** `AR/tests/identical-rows.test.ts`, "two rows left over that only elimination holds done". It reads 2 by a forward pass and 2 by a press, and the press says several fit.

Both fail with elimination off.

## Test edits

No existing test was edited, not even mechanically. The two tests above are additions.

## Commands and observed output

Run on the final tree. Only the neighbours and `ui-components` ran before the last comment-only edit, or before the mutations and the temporary probe, which were all undone.

```text
(root) pnpm.cmd --filter @fluxiq/contracts build                  exit 0
(root) pnpm.cmd --filter fluxiq check                             exit 0, 0 error TS
(packages/fluxiq) vitest run src/runtime/answer-first src/runtime/llm/repeat-guard
  src/framework/automation-service/service/answer-first           Test Files 95 passed (95), Tests 1003 passed (1003)
(packages/ui-components) vitest run src/chat/answer src/chat/ports src/testing/results
                                                                  Test Files 6 passed (6), Tests 70 passed (70)
(root) node scripts/structure-audit.mjs                           structure-audit: passed (504 warning(s), 1097 baselined)
Marker search, the eight files                                    none
Marker search, all of packages/                                   0
Neighbours: src/runtime/llm/decision-handlers, src/runtime/llm/node-tools,
  src/runtime/automation-activity/tests/observer                  Test Files 47 passed (47), Tests 451 passed (451)
```

The earlier `identical-rows.md` reported 117 files and 1416 tests for "the brief's command", against 95 and 1003 here. All 95 test files on disk under these three folders ran and passed, so this run skipped nothing. I could not see that earlier command, so I assume it named more folders.

**Mutations.** Each was applied and restored, with the files compared by `cmp` against backups. No probe marks remain, and the temporary probe test is deleted.

| Mutation | Tests failing | Shows |
| --- | --- | --- |
| The rule answers nothing for a reshaped row | 44 of 281 | Both lanes fail: t869's `same-row`, `same-row-limits`, `row-identity`; t870's `row-shapes`, `identical-rows`, `foreseen`, `seed` |
| No `begun` at the gate | 10 of 67 | This lane fails: `begun-before-sent` (5), `begun-in-chain` (3), `interrupted` (2) |
| No elimination | 2 of 32 | Only the two new tests |
| No clause from decision 1 | 2 of 239 | The two `identical-rows` tests |

## Not verified

- A browser or a real model, as briefed.
- The Extension's tests and check against this merge.
- `dist`, beyond the contracts build.
- Core suites outside the folders listed above.

## Still contradicting

No test contradicts another. The closest is decision 2: a t870 test forces a printed handle to read as a new row in a shape that t869's rule 3 would otherwise tie.

Report: docs/working/answer-first-plan/reports/second-attempt/merge-dev.md
