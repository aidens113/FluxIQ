# t869 loop-and-counts

Outcome: Done (two failures in other workers' files, below).

## Changed
- Contracts `task-attempts/loops-caught.ts`: `same_act` is the sixth pattern, with its no-count. `read...LoopsCaught` reads a record with no `same_act` as zero for it; a malformed `same_act` or an unknown pattern is still refused. Tests added in `tests/loops-caught.test.ts`.
- ui-components `chat/ports/results.ts` and `testing/results/outcomes.ts` restated with the sixth pattern.
- `loop-signal/loops-caught.ts` no longer folds (identity); `tried-as-contract.ts` header updated; `signal.test.ts` now expects `same_act` under its own slot.
- `asked-count/read.ts`: new `multipliedCountsOf`. Header updated. Reads "add this 3x", "renew the card x3", "add x3 of this", "add 3x of this", "add a dozen of this", "add 2x to my cart", "x20" (digits rule). Only in a clause starting with a do-verb (add, put, renew, order, buy, ...), not describing, not negated. Trailing forms need an object before them and no determiner/size/model/of/in before; a form right after the verb needs "of", "to" or "into" after it. "half a dozen" is not read.
- Tests moved: "Add a dozen of this." and "Add 3x of this." left the stays-at-one list (now read, as the brief asks). Every trap in the brief is in the stays-at-one list.

## Results
- fluxiq vitest (asked-count, loop-signal, loop-detection): 4 files, 110 tests passed.
- contracts `src/task-attempts`: 9 files, 83 passed. ui-components `chat/ports/tests` + `testing/results/tests`: 2 files, 15 passed.
- contracts check: Done. ui-components check: Done.
- fluxiq check FAILED, not in my files: `service/flow-bootstrap-requests/generate.ts(111,30)` and `(111,68)` TS18048 `request.actor` possibly undefined.
- structure-audit FAILED, not in my files: `service/flow-settings-requests/update.ts` line 6 imports `../flow-settings/cost-limit-choice.ts` instead of the barrel (the flow-settings worker's path).

## Not verified
Extension (`!FluxIQWebExtension`) files still say `same_fix` and were not touched: `apps/extension/.../outcome-of-run.ts`, `packages/test-runner/src/attempt-lane/scripted/driver.ts`, `loop-replay/corpus.ts`, `loop-replay/replay-run.ts`, attempt-series test. They may need `same_act` added if they build a full loopsCaught record. No other ui-components file broke the type check.
