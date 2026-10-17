# t692 keep-all read is a doubt: worker report

## Outcome

**Partial.** Both owned halves are built and tested: the read accounts flag the read, and the subflow trial gate re-asks and refuses an unaccounted yes. Neither takes effect in a live run yet. The wiring that carries the flag to the judge and the gate sits in files the brief did not let me edit (see "Open questions"). Every test I added fails with the fix switched off. No existing test changed its expectation.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/`.

- `result-verification/read-account/kept-every-row.ts` (new): `automationStudioResultReadKeptEveryRow` and the types `AutomationStudioResultKeptEveryRow` and `AutomationStudioResultKeptEveryRowCarrier`. A later read is flagged when **all** of these hold:
  - It has no condition, neither authored nor counted, and it is not `unfiltered`.
  - `itemsSeen` was counted, is above 0, and equals `kept`.
  - In the same frame (`parentAttemptId`) and earlier in the run, a lasting step succeeded as a member of a `builtin.control.for-each` loop. "Lasting" means `automationStudioNodeActLasts` is true, the step is not `builtin.*`, and it was not skipped and not `stateHeld`.
  - That loop's rows come from an earlier read whose own conditions rejected rows, so its `kept` is less than its `itemsSeen`.
- **How "same list" is decided:** from what Core records, never from words. Two checks must both pass:
  - **Lineage:** a graph edge runs from the earlier read into the For Each's `items` port. That is the port `draft-routing.ts` wires a `repeat over` into.
  - **Read target:** the two nodes share one `definitionId`, and their read parameters (`automationStudioResultReadParameters`) are equal value for value once the members that say what a read keeps or stores are removed. Those members are `where`, `fields`, `dedupe`, `paginate`, `recordOutput`, and any key starting `min`, `max` or `timeout`. Key order does not matter.
  - A read whose remaining target is empty is never treated as the same list.
  - In the debugged run, both reads came from `extractList: extraction.3`, so their item target is identical.
  - The target is only compared, never said. The flag carries node ids, counts, `sameList: "items_edge_and_read_target"` and Core's sentence. No locator, page value or label goes into it.
- **The sentence** states what was measured, never a verdict. It says:
  - step X read the same list as step Y, after the acting steps ran once for each row Y kept;
  - Y's conditions kept k of the s items it saw, and X has no condition and kept every one of its n;
  - so nothing in X chose which rows the answer holds, and each row X stored is to be checked one by one against the request's own words for what the answer holds;
  - a yes names each such row with the words that ask for it.
- `read-account/accounts.ts`:
  - New optional input `flowEdges`. When it is given, a flagged read carries `keptEveryRow`; when it is absent, no read does, so current callers are unchanged.
  - The return type is now `AutomationStudioResultReadAccount & AutomationStudioResultKeptEveryRowCarrier`.
  - The header documents the flag.
- `read-account/sentence.ts`: the full sentence (the re-author's) appends the flag's sentence. The brief sentence is unchanged, because it is capped at 1,024 characters.
- `read-account/index.ts`: exports the new module and mentions it in the header.
- `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`:
  - New header paragraph (t692) explaining the row check.
  - **New exported types:**
    - `AutomationStudioSubflowTrialKeptEveryRowRead`: `{ nodeId, kept, keptEveryRow }`. The port carries it beside its result under `keptEveryRow`, and it is never shown to a model.
    - `AutomationStudioSubflowTrialRowCheck`: `{ reads: [{ read, rows: [{ row, asked, words? }] }] }`.
  - **New optional port hook** on `AutomationStudioSubflowTrialPreparingPort`: `checkRows({ scope, revision, digest, trialRunId?, reads, signal })`.
  - **When the check runs:** on a yes whose entry was prepared and whose result carries flagged reads. It runs before the standing-no weighing.
  - **The yes stands** only if the check accounts for every stored row of every flagged read: places 1..kept, each exactly once, each with a boolean `asked`, and non-blank `words` wherever `asked` is true. The feedback then gets `keptEveryRow` and `rowCheck`.
  - **Any row with `asked: false`** turns the trial into a **no** (`subflow.trial_rows_not_asked`, with `rowsNotAsked: [{ read, rows, of }]`). That closes the digest, as any no does.
  - **Anything else** makes it **unsure** (`subflow.trial_rows_unaccounted`). "Anything else" covers a missing or duplicate row, a missing reason, a check that throws (its error text is never shown), and a port with no `checkRows`. The revision is not closed and can be retested.
  - A new instruction, `ROWS_UNACCOUNTED_RETESTABLE`, tells the builder to give the read a condition that keeps exactly the rows asked for, or to retest if every row is asked for.
  - A no, or a yes with no flagged read, never triggers the check.
- **Tests (new):**
  - `result-verification/read-account/tests/kept-every-row.test.ts`, 8 tests on a returns desk: approve the returns of at most 50, then read the returns list with no condition.
  - `flow-bootstrap/subflow-candidate/tests/kept-every-row-check.test.ts`, 5 tests on the same site.
  - No words from the scenario appear in code, tests or model text.

## Commands run and observed results

- `npx tsc --noEmit -p tsconfig.json`, run in `packages/fluxiq`: the first run printed 3 type errors, all in my new tests. I fixed them; the final run gave `exit=0` with no output.
- `npx vitest run <the two new test files>` with the fix switched off. I patched the flag function to return nothing and the gate to skip the check, then restored both files and confirmed with grep that no trace of the patch was left. Result: `Tests 7 failed | 6 passed (13)`.
  - The 7 that failed are every positive case: 3 in the read-account file and 4 in the gate file.
  - The 6 that passed are guard tests ("not raised where…", "asks nothing for…"). With the fix off they hold trivially, because nothing is flagged.
- `npx vitest run src/.../runtime/result-verification src/.../runtime/flow-bootstrap/subflow-candidate src/.../runtime/service/subflow-trial src/.../runtime/service/candidate-trial`: `Test Files 176 passed (176)`, `Tests 1358 passed (1358)`. Run twice, the second time after the import fixes, with the same result.
- `node scripts/structure-audit.mjs`, run in the worktree root:
  - The first run gave 3 violations: two `imports` (I had reached into files instead of barrels) and one `statement-packing` in my test.
  - After fixing them: `structure-audit: passed (395 warning(s), 1155 baselined).`, exit 0.

## Not verified

- No live run and no judge call. The feature is not reachable from a real trial until the wiring below lands.
- The read-target comparison was checked only against the shape seen in the debugged run (`extractList.item` from one handle) and against my test fixtures. Two cases would be missed:
  - two different handles whose item targets differ although they point at the same list;
  - a domain whose read parameters differ in a key outside the excluded set.
- The whole-candidate gate (`flow-bootstrap/candidate/trial-gate.ts`) was not touched.

## Open questions or contradictions found

The brief's ownership does not cover the files that carry the flag into the judge's summary and into the gate. Each of the following is needed and was left alone:

1. **`result-verification/contracts/read-account.ts`**: add `keptEveryRow?: AutomationStudioResultKeptEveryRow` to `AutomationStudioResultReadAccount`, with `import type` from `../read-account/kept-every-row.ts`. Until then, the field rides along through an intersection type returned by `accounts.ts`.
2. **`result-verification/result-summary.ts:242`**: pass `flowEdges: input.flowEdges` to `automationStudioResultReadAccounts`. Without it no read is flagged, and the judge's summary never shows `keptEveryRow`. The summary already spreads each read, and `value-readings` keeps unknown members.
3. **Service ports**: `service/subflow-trial/run.ts` and the single-subflow whole port in `project-agents/single-subflow/single-subflow-trial.ts` (which I was told not to touch).
   - Each must put `summary.reads.filter((read) => read.keptEveryRow).map(({ nodeId, kept, keptEveryRow }) => ({ nodeId, kept, keptEveryRow }))` beside its result under `keptEveryRow`.
   - Each must also implement `checkRows`, which asks the judge the per-row question and needs a prompt in `llm/**` (also off-limits).
   - Until `checkRows` exists, any port that carries the flag will have its flagged yeses made unsure. That is safe, but carrying the flag without the hook would block builds that legitimately ask for every row, so the two should land together.
4. The gate cannot see whether a judge's first yes accounted for the rows, because a yes feedback carries no reading. So it asks again through `checkRows` rather than reading the first answer. The agreement-level duty for a yes to name each such row belongs to the other worker's `agreement/**`.
