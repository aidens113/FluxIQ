# One rule for the same row in another shape (t869 merging t870)

Core worktree `fxwork/t869/!FluxIQ`, with a `git merge` of dev in progress. `A/` = `packages/fluxiq/src/runtime/answer-first/act-record`.

## Outcome

**Done.** The three conflicted files hold one rule, in `A/same-row.ts`. Every test from both lanes passes unedited, and no test contradicted the other lane's once the rule asked whether a read had shown the row. I staged nothing. The lead stages the three `UU` files, plus `A/same-row.ts`, `A/contracts.ts` and `docs/architecture/automation-studio/llm-flow-bootstrap.md`, and does not stage the deleted probe (it is gone).

## Which rule I kept, and why

**I kept t869's rule as the base and took t870's as its second half.** Neither could stand alone:

| Test | t869 alone | t870 alone |
| --- | --- | --- |
| `row-shapes`: `{title, copies: 2}` against `{title, copies: 3}` must be two rows, and so must a different member, link or flag | Fails: the title fits, so it reads as one row | Passes |
| `row-identity`: a row whose due date the press moved must be the same row | Passes | Fails: a kept value differs |
| `row-identity`, `same-row`: a trimmed field and a derived field | Passes | Fails: compares whole values only |
| `row-shapes`: acted rows stay past `MOST_ROWS`, and a number read back from text | Fails without `acted` and `plainNumber` | Passes |

I read this table from the code and did not run either lane's rule alone. The nearest runs are in section 5: rule 3 alone fails "differ in a column both kept", and rule 4 alone fails seven act-record tests.

The top two rows look like a contradiction, and they are not. In t870's cases no read ever showed either row. In t869's cases a read showed at least one of them, as one of a list. A list is what lets a difference be excused, because the row is already told from everything else on that list.

## The rule now, in plain words

1. Two rows of one read are never one row.
2. Something must tie them: a word with a letter, a long id or an address. A bare number or date never does.
3. **A read has shown either row:** that list decides. Per earlier read, the row that fits best is the row, and rows that fit equally all are. A kept value may differ, since the press may have changed it. A field more than one row of a read holds tells no row apart, unless the row has nothing else.
4. **No read has shown either** (two rows only an act or a run carried): there is no list to choose among, so every value of the row with fewer must lie in the other. A kept value that differs means two rows.

An act keeps the digests of its row's other shapes, and its id and `rowIdentity` stay the row's own. The sentence naming a by-hand press still ties later reads, as it did.

## What I took from t870

- `sameRow` and `valuesOf`, moved unchanged into `same-row.ts` as rule 4.
- `plainNumber`, `MOST_ROWS` eviction that never drops an acted row, `begun`, `rolledBack`, `withdrawn`, `counted`, `carried`, `seed.ts`, `landedAt` and `doubted`. Apart from the rename below, these are as t870 wrote them.
- The gate's order: `withdrawn` first, then the reads are noted.
- **`void this.changed()`:** only `begun` awaits its write, because it must not send on a failed write. Every other caller is `void`, including `noteReadRows`, where t869 had a bare call. `changed()` catches its own failure and keeps it for `flushed`, so nothing can reject unseen.

## Every disagreement, and how it was settled

| Disagreement | Settled | Why |
| --- | --- | --- |
| A kept value differs | Excused where a read showed either row, and two rows where none did | The two tests above |
| Whole values or 60% of a field's words | 60% with a list, whole values with none | Without a list, 60% would drop a real run's "Birds of the Marsh" after "Birds of the Coast" (probe P1) |
| Does noting an acted row count as a read? (t870 went through `note`) | No: new `noteActed`, which adds no read | Otherwise each acted row would be a one-row list and rule 4 would never run |
| `sameAs(row)` (all rows) or `sameAs(row, among)` (acted rows) | t869's `sameAs(row)`, own digest first | An act must keep its other shapes. `rowDone` and `matches` intersect with `entry.rows` anyway |
| `rows` plus `ownRow`, or `rows` plus `sameRows` on the identity | t869's `rows` plus `ownRow` | Same information. `matches` now reads `identity.rows` and `sameRows` is gone |
| A long number: t869 says an id ties, t870 says no number does | Ties only as written. `1055628457` ties and `1,250,000.00` does not | `plainNumber` would otherwise turn an amount into an id (probe P13) |
| A row with a telling address and only common words | **New, and neither lane had it:** the common words stop counting as its telling fields | Rows sharing a title at different addresses collapsed (probe P8 was `[true, true]`, now `[true, false]`) |
| Records with no `reads` | Read-less rows on both sides go to rule 4. A read-less row against a listed one is taken as one list | t869's old-record test passes either way. It is stricter for a row that changed, which is a limit below |

## What a real row can still get wrong

**Pressed twice (the worse error):**

- Rows sharing every word but one field, when the press changes that field. A read of `(Atlas, a1)` and `(Atlas, b2)` followed by `(Atlas, zz)` and `(Atlas, b2)` gives `[false, false]` (P5), so the first row is pressed again. t869 had this too.
- No read showed either row and a field is trimmed or derived: `{Atlas of Rivers}` then `{Atlas of R…}` is false (P10). This needs an act in a real run and then another Flow's shape, with no read between them.
- No read showed either and the press changed a kept value.
- From t869: a row sharing no word with any read or the press's sentence (a test states this), and a one-word field cut inside its word.
- A row's address changing where its only other fields are common words. This is the cost of the P8 change.

**Left out (visible as a skipped count):**

- A different row with 60% of a field's words, when that row is missing from the earlier read.
- A row that differs only in a word-bearing value, when the earlier read did not list it: `[{title, Ann}]` then a later `{title, Ben}` is held done. Rule 3 chooses this on purpose, because a press can change any value. Within one read they stay two.
- An unmarked long number as a JSON value ties as if it were an id (P13b).

P5, P10 and P13b were run. The rest follow from the code or from t869's report, and I did not probe them.

**Telling is still thin**, as t869 reported: a skipped row shows only as a count the model reads.

## What changed and why

- `A/same-row.ts`: the rule, with a short header saying it and why, and t870's `valuesOf` and `sameRow`.
- `A/row-ties.ts`: `note(rows, acted)` returns the read's digests, new `noteActed`, one private `hold` for both, one `sameAs`. The t870 header paragraph is replaced by a pointer to `same-row.ts`.
- `A/record.ts`: conflicts resolved as above and a single "one row, several shapes" header paragraph.
- `A/gate/act-gate.ts`: `withdrawn`, then one note per read.
- `A/contracts.ts`: one comment on `reads`.
- `docs/architecture/automation-studio/llm-flow-bootstrap.md`: the rule's paragraph.

**No test was edited**, not even an import path. No other merge file was touched.

## Commands run and observed results

All from `packages/fluxiq`, on the final tree, with `--minWorkers 1 --maxWorkers 2`.

```text
1. vitest run src/runtime/answer-first/act-record
   Test Files 10 passed (10)   Tests 159 passed (159)
2. vitest run .../answer-first/tests/{row-identity,later-attempt,carry-on,interrupted}.test.ts
   Test Files 4 passed (4)     Tests 61 passed (61)
3. vitest run src/framework/automation-service/service/answer-first src/runtime/answer-first
   Test Files 63 passed (63)   Tests 676 passed (676)
4. (Core root) pnpm.cmd --filter fluxiq check    exit 0
   (Core root) node scripts/structure-audit.mjs  structure-audit: passed (501 warning(s), 1097 baselined).
```

**5. Taking things out.** Each was restored before the next. Act-record's 159 tests ran each time, plus the service files where named.

| Taken out | Result | Fails, for example |
| --- | --- | --- |
| The whole rule (with `row-identity`, `later-attempt`) | 24 failed of 194 | `row-shapes` renamed keys, dropped column, number read back; `same-row` old records |
| Rule 3, the list | 7 failed of 159 | `same-row` shared address, numbers and ids, real run's row |
| Rule 4, the values | 1 failed of 159 | `row-shapes` "differ in a column both kept" |
| `markCommon`'s effect | 2 failed of 159 | `same-row` "a word every row holds ties nobody" |
| The gate's `begun` | 5 failed of 159 | `begun-before-sent` |
| Acted rows kept past `MOST_ROWS` | 1 failed of 159 | `row-shapes` "past the bound" |
| `counted` (with `row-identity`, `later-attempt`) | 1 failed of 194 | `begun` "lets a run's next press through while the count has room" |
| The sentence tie alone (`row-identity`, `same-row`) | 1 failed of 29 | `same-row` "quite different columns" |
| The rule **and** the sentence tie | 24 failed of 29 | `row-identity`: renamed, fewer, trimmed, derived, a field the read had not, a row the act changed |

**The six service reshape cases survive either tie being removed alone**, because the fake library's answers name the row. Only with both out do all six fail. On a page whose answer names no item, the rule is what holds them, and the `row-shapes` failures show that.

**Restored:** `rg T869-PROBE` under `A/` finds 0 matches, and `cmp` against the pre-mutation copies is identical for all four mutated files. The temporary probe test (`A/tests/zz-probe-t869-merge.test.ts`) is deleted. Conflict markers under `A/`: 0.

**The probes** (temporary, values printed):

```text
P1  run rows, Coast acted, Marsh asked                        false
P2  one read, one field apart, second admit                   run
P3  run rows differing in one kept field                      false
P4  same, reshaped by a later read                            [true,false]
P5  shared title, press changed the only telling field        [false,false]   limit
P6  press changed a status no other row shared                [true,false]
P6b same, a real run's unnoted row                            true
P7  run's act, next attempt's read shows it changed           [true,false]
P8  one-row read, reshaped list adds same title elsewhere     [true,false]
P10 no list, trimmed field                                    false           limit
P13 amount with marks, alone                                  false
P13b long unmarked number, alone                              true            limit
P15 unnoted other copy, read's shape                          false
P16 unnoted other copy, reshaped                              false
P17 unnoted acted copy, reshaped                              true
```

## Not verified

- **A browser or a real model.** Everything here is provider-free Core tests.
- **The Core `dist`.** Not rebuilt, as briefed.
- **New coverage for P5, P7, P8 and P13 is not in the suite.** Tests were read-only for me, and the probe is deleted. P7 and P8 are behaviour no test now pins: a later edit could lose them.
- **The extension worktree's tests**, and every suite outside the two named folders.

## Open questions or contradictions found

1. **No test contradicted the other lane's.** The apparent one is settled by rule 3 against rule 4, above.
2. **The P8 change adds a behaviour neither lane's tests asked for.** I made it because the brief says distinct rows with common fields must not collapse. To drop it, remove `|| tellingPaths(row).length > 0` from `tellingFields`. Act-record and `row-identity` pass either way: I ran both with and without it. The whole folders ran only with it.
3. **For t870's merge:** `row-ties.note` no longer takes single acted rows (use `noteActed`), `sameAs` takes one argument, and `identity.sameRows` is gone (`identity.rows` holds them).
4. **Conflicts remaining:** `git diff --name-only --diff-filter=U` lists only `A/gate/act-gate.ts`, `A/record.ts` and `A/row-ties.ts`, which are resolved in the working tree and waiting on the lead's stage.

## Follow-up: P5 closed by elimination, and the limits kept as tests

This supersedes the P5 line and the "no kept test" line above.

**The change.** Rule 3 in `same-row.ts` gains one step. A row that fits nothing in an earlier list is that list's row when all of these hold: every other row of both lists plainly matches (same digest, or a fit), exactly one row is left over in each, and most of their words are the same with at least one word that can tie. P5 went from `[false, false]` to `[true, false]`. It compares no positions, and a test puts the leftover row last to show that. The elimination does not need to know which row was acted on: it says only that the two rows are one, and `entry.rows` decides whether that one was acted on.

**One departure from the brief: "share at least a word" became "share at least half the words of the longer row".** "At least a word" contradicts an existing test. `same-row.test.ts`, "a read of quite different columns", has `(Data lead at Kade Energy, Accept)` and `(Recruiter at Orbis, Accept)` followed by `(Recruiter at Orbis, Accept)` and `(Buyer for Moss, Accept)`, and it requires Buyer to be not done. Those counts have the same shape as P5, and the leftover pair share "Accept". With the threshold at 0, that test fails, as does the new counter-case. At half, `(Atlas, a1)` and `(Atlas, zz)` pass with 1 word of 2, and the Buyer pair fails with 1 of 6. I did not edit the test.

**What it can still get wrong:**

- **Left out, the lesser error:** one row gone and a new one come between the reads, when at least half their words are the same. `(Atlas, a1)` and `(Atlas, b2)` followed by `(Atlas, c3)` and `(Atlas, b2)` holds `c3` done. The counts cannot tell this from P5. A test states it as a known limit, and the new row is left out and counted, never pressed twice. Short rows are the exposed ones: `(Ann, Waiting)` replaced by `(Cid, Waiting)` is 1 word of 2, so it collapses. I reasoned that one from the threshold and did not run it. `(Ann Lee, Accept)` replaced by `(Cid Moss, Accept)` is 1 of 3 and stays two, and a test holds that.
- **Left out:** the same happens across two unrelated lists of the same shape, since nothing says two reads are the same list. Reasoned, not run.
- **Left out:** rows with their own addresses are not protected from this. `(Engineer, /jobs/1)` and `(Engineer, /jobs/2)` followed by `(Engineer, /jobs/3)` and `(Engineer, /jobs/2)` holds job 3 done if job 1 was pressed. I kept this because blocking it would bring back a double press where a press changes a row's link. Reasoned, not run.
- **Pressed twice:** the row changed and something else changed too, so two rows are left over. A test states this: `(a1, b2, c3)` followed by `(zz, yy, c3)`.
- **Pressed twice:** a press that changes most of a short row's words, since they then fall below half.
- **Left out, unchanged by elimination:** a row no read has shown has no mark of what its list shares, so the shared word alone ties it. A test states this.

**Cost:** a temporary probe measured 500 `rowDone` calls with 1,000 rows held. 500 new rows took 1,317 ms, 500 reshaped rows took 1,107 ms, and 499 unchanged rows plus one changed took 77 ms. I did not measure the same runs without elimination. `unmatched` stops at the second leftover.

**The tests:** `act-record/tests/same-row-limits.test.ts`, new, covers P5, its counter-cases, P7, P8, P13, P13b and P10. Each limit is named "known limit" and states today's answer. No existing test was edited.

**Commands, from `packages/fluxiq`, on the final tree:**

```text
pnpm.cmd exec vitest run src/runtime/answer-first/act-record .../tests/row-identity.test.ts .../tests/later-attempt.test.ts --minWorkers 1 --maxWorkers 2
  Test Files 13 passed (13)   Tests 211 passed (211)
(Core root) node scripts/structure-audit.mjs
  structure-audit: 3 violation(s) across 3 rule(s), none under act-record: directory-files and naming in programs/automation-studio/api/handlers/, failure-as-empty in runtime/conversations/commands/answer-first/known-flow.ts, all outside this brief (the other worker on this tree).
```

**Taken out, with `same-row-limits` and `same-row`, then restored:**

| Taken out | Result | Fails |
| --- | --- | --- |
| Elimination | 4 failed of 33 | P5, the other-columns case, the any-position case, and the gone-and-new limit |
| The half threshold (set to 0) | 2 failed of 33 | `same-row` "a read of quite different columns", and the new "share only a word" case |

`T869-PROBE` under `act-record/`: 0 matches. `same-row.ts` is identical to the copy taken before the take-outs, and the timing probe is deleted.

**Not verified:** a browser or a real model, as briefed. `dist` was not rebuilt, as briefed. I ran only the suites named here, not the two whole `answer-first` folders, so the rest of those folders has not run against elimination. The doc paragraph in `llm-flow-bootstrap.md` is updated.

```text
Outcome: Done
Changed: same-row.ts, tests/same-row-limits.test.ts (act-record); llm-flow-bootstrap.md; this report
Validation: `pnpm.cmd exec vitest run src/runtime/answer-first/act-record ...row-identity ...later-attempt --minWorkers 1 --maxWorkers 2` -> 13 files, 211 passed; `node scripts/structure-audit.mjs` -> 3 violations, none in my paths (handlers/ and commands/answer-first/known-flow.ts)
Not verified: browser or real model; dist not rebuilt; the rest of the two answer-first folders not rerun against elimination
Report: docs/working/answer-first-plan/reports/attempt-road/same-row-merge.md
Notes: "Share at least a word" became "half the longer row's words", because an existing same-row test requires it.
A row gone and another added between reads is left out, never pressed twice.
```

## Second follow-up: cannot tell (supervisor, on the lead's decision)

The elimination above still pressed where more than one row was left over. The lead decided that when nothing separates them the answer is "cannot tell", refused rather than guessed. `byElimination` now holds every row left over in the later list against any row left over in the earlier one with most of its words the same. So `(a1, b2)` then `(zz, yy, b2)` is `[true, true, false]` and the gate answers `already_done`, `already_done`, `run`. `(a1, b2, c3)` then `(zz, yy, c3)` moved from "known limit, pressed twice" to "known limit, left out". Those two limits and the two "say nothing" tests in `same-row-limits.test.ts` were this lane's own and new, so changing them touched no other lane's test. Nothing else moved: a new row beside rows all still there is still a new row, and rows sharing no word stay two.

**The cost:** a list where the pressed row has gone and several new rows arrived, sharing half their words, leaves all of those out. They reach the model only as a skipped count, so telling the person is still a seam in t870's `runtime/answer-first/result`.
