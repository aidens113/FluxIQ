# Second attempt: the proof, and the double-act proof on this path (t870)

## Outcome

Partial. Every case in the brief passes through the real service, the real engine and a scripted model. Three real defects were found and fixed. One double press is still open, because closing it needs a domain seam outside my paths. `pnpm --filter fluxiq check` also reports 3 `error TS` lines, all in another lane's file (below).

`AF/` = `packages/fluxiq/src/framework/automation-service/service/answer-first/`.

**Still open, plainly.** A by-hand press by a control's handle, where no read printed that handle, is admitted on a row the run already pressed. The web domain's rows print no handles today (`row-ties.ts` header), so this is the live shape. Test: "known limit, needs a domain seam". Atlas reads 3, where it should read 2. The seam needed: a way to turn a handle into its row or frozen target before the send, read in `runtime/answer-first/act-record/gate/act-gate.ts`. Today the gate has only `wordsOf`, and `binding.describeCall` gives only a target's words. This is acts.md's open item 4, now shown through the service.

## What changed and why

- `tests/second-attempt-proof.test.ts`, `tests/double-act-on-run.test.ts`: new, 36 tests.
- `tests/library-site.ts`, `tests/honest-attempts.ts`: new helpers. A site whose controls can be renamed, and a first attempt written the honest way.
- `tests/fake-library-engine.ts`: `over` also sees parameters and inputs; `pressLoan` and `pressCard` are exported; `title`, `control`, `expectedState` and `retry` parameters added.
- `tests/later-attempts.ts`: counts how many times a provider is resolved in an attempt.
- Fixes: see "Defects found and fixed".

`attempt/rounds.ts`, `attempt/run-attempt.ts`, `attempt-store/*` and `tests/interrupted.test.ts` also show as modified. Those are not mine.

## Each case, measured

Prices are the mock's: $0.001 a decision. A `run_flow` attempt's 2 calls are the instruction read and the judge.

| Case | Attempt | Path | Calls | Dollars | Presses |
| --- | --- | --- | --- | --- | --- |
| 1. Flow holds | 1 | `explore` | 7 | 0.0065 | 4 rows once: 1 by hand, 3 by the walker |
| | 2 | `run_flow`, 0 decisions, 1 judge | 2 | 0.0015 | 4 rows once, all by the engine |
| | 3 | `run_flow` | 2 | 0.0015 | the same; saved state `ready` |
| 2. Breaks after the rows (card renamed) | 1 / 2 / 3 | `explore` / `run_flow_then_repair` / `run_flow` | 8 / 6 / 2 | 0.0075 / 0.0055 / 0.0015 | attempt 2: rows by the engine, card by the walker, each once |
| 2. Breaks at the row's own step | 1 / 2 / 3 | `explore` / `run_flow_then_repair` / `run_flow` | 7 / 7 / 2 | 0.0065 / 0.0065 / 0.0015 | attempt 2: all by the walker; attempt 3: all by the engine, no decision |
| 3. Repair fails, carries on by hand | 2 | `run_flow_then_explore` | 11 | 0.0105 | once each; the next Flow is kept, `partly_works` |
| 4. Budget-out at 2 of 4, same words | 1 / 2 | `budget_out` / `run_flow` | 11 / 2 | 0.011 / 0.0015 | the engine pressed only the other two; total one each |
| 4. Further ask after achieved | 3 | `run_flow` | 2 | 0.0015 | all four again |
| 4. "three times", broken then repaired | 2 | `run_flow_then_repair` | 4 | 0.0035 | 1 by the engine, 2 by the walker; the third pass only checks |
| 4. "three times", budget-out at 2, same words (added) | 2 | `run_flow` | not logged | not logged | the third press and no more |
| 5. Step bound | 2 | `run_flow_then_explore` | 2 | 0.0015 | really tripped at 250 attempts |
| 5. Run's deadline | 2 | `run_flow_then_explore` | 4 | 0.0035 | none |
| 5. Judge cut off by its deadline | 2 | `run_flow_then_explore` | 4 | 0.0035 | once each |

The draft is really a row-bound repeat. The test asserts `routing: { kind: "repeat", over: <the read> }` and `title: { $state: { path: "item.title" } }`. The engine's For Each drives it: each press got its own row as `item` and its own title through the binding.

**Unreached limits.** In all three limit cases and on a whole run that holds, a provider was resolved exactly once in the attempt, and the model saw only decisions and judge calls. A run's recovery and its result check both resolve through the same resolver (`service.ts:2396`, `:2475`), so reaching either would have raised that count.

## Double-act table

**What the detached run's retry really does.** `runAutomationStudioDetachedCandidate` sets no policy, so a node gets the default: first attempt plus three retries at 250 ms, 1 s and 2 s (`engine/automation/retry-policy.ts:46-49`, `:77-95`). Retries do reach a lasting step, but only one whose failure states `effect: "unacted"` (`defensive/assess.ts:143`). The test proves it: 4 node calls over at least 3.2 s.

| Case | Node calls | Presses | What stopped the second press |
| --- | --- | --- | --- |
| a. Failed before acting, `unacted` | 2 | 1 | Nothing needed to: the retry is the first real press |
| b. Landed, retryable error, or found after acting, or `ambiguous` | 1 | 1 | **The engine's own guard.** `assess.ts` marks it `actUncertain`, the effect check answers `unknown` with no host, and the run stops as Outcome uncertain (`step-loop/failed-attempt.ts:94`) |
| b. Landed, an error that may not be retried | 1 | 1 | The engine: the target said the same request gets the same answer |
| b. Landed, thrown | 1 | 1 | The engine: the native runtime turns a throw into a failure holding only a message (`native-node-runtime.ts:168`), which is not retried |
| b. Host's check says `not_landed` | 1 | 0 | **The gate.** The engine does retry, and the gate answers "already done" without sending. Safe, but too little: a judge's no brought it back by hand, once |
| c. Answer lost to the deadline, landed | 1 | 1 | The persisted may-have-landed. By-hand refused until a look. The forward run sends `verify` only. Not pressed after a look that shows it landed |
| c. Same, did not land | 1 | 1 by hand | A look opens it; a second by-hand press is refused as done |
| d. Verification failure after success | 1 | 1 by hand | `record.doubted`: refused while the look fails, then one press after a look, never "already happened" |
| e. Rows: error, throw, deadline | 1 on the row | one each | The forward run leaves out the done row and the row in doubt; the rows not reached go |
| e. Row in doubt, by hand | 1 | once | Refused until a look, once after, then refused as done |
| f. Stop mid-press, new ask | 1 | 1 | The seed carries it, and the gate answers it without sending |
| f. On a repeat | 1 on the row | one each | The same; the engine presses only the rest |
| f. Process dies mid-press (second service over the same data; no real kill) | 1 | 1 | Written before it was sent; the seed carries it |

## Defects found and fixed

1. **A double press.** A by-hand press by a printed handle, on a row the engine pressed: the handle named the row in the read's shape and the act held it in the For Each's shape, so they never matched. Atlas read 3. Fixed in `row-ties.ts` (`sameAsHeld`) and `record.ts` (`identityOf`), with tests through the service and in `row-shapes.test.ts`.
2. **A double press.** A step that declared nothing, whose target answered `effect: "ambiguous"`: the engine held it back, the record knew nothing of it, and a repair's by-hand press went straight through. Now held as may-have-landed at both doors (`run-acts/settling.ts`, tests in `settling.test.ts`).
3. **A false "ready".** A run whose every step was refused as already done sent nothing, was judged yes, and marked the Flow proven whole. A run that sent nothing now proves nothing (`attempt/remember.ts`).

## Mutations

Each was applied by script, run against the two proof files, and restored. The later grep counts confirm the restores. All but the first ran before the last two tests were added.

| Mutation | Tests failing |
| --- | --- |
| `settle` off on the gate | 24 of 36 |
| Begun-before-sent off | 3 of 34: (c), (e) deadline, (f) process dies |
| Row match to exact identity | 7 of 34 |
| Printed handle not read across shapes | 1 of 34 |
| The target's `ambiguous` not held | 1 of 34 |
| `doubted` off | 1 of 34 |
| A seed carries nothing | 4 of 34 |

## Commands and observed output

- From `packages/fluxiq`: `pnpm.cmd exec vitest run src/framework/automation-service/service/answer-first src/runtime/answer-first --minWorkers 1 --maxWorkers 2` -> `Test Files 60 passed (60)`, `Tests 648 passed (648)`, exit 0, Duration 365.92s.
- `pnpm.cmd --filter fluxiq check` -> exit 2, **3 `error TS` lines**, all in `src/runtime/action-permissions/tests/request.test.ts`. That file and `action-permissions/request.ts` are another lane's uncommitted edits, and I touched neither. None of my files has an error.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (502 warning(s), 1097 baselined).`

## What is only scripted

- **The model and the judge are scripts.** A real model finding these repairs is not shown. Nor is a real judge saying yes or no.
- **Core does not read what a look shows.** "After a look that shows it landed, it is not pressed" holds only because the script reads the page. Test "known limit: a look lifts the hold": a careless model pressing at its first decision, after the round's opening look, presses again (card reads 3). **For a real model this is the weakest point left.**
- **The target is a fake.** Row shapes, failure records, `actedOn` sentences and a host's answers are written from the code, not read from the web domain.
- **No browser, Lab, real site or real key.** No real process kill either.

## Not verified

- Real web domain answers, and `resolvePlanNodeParameters` on real saved steps.
- Stale-target re-find on this path.
- Calls and dollars for the "three times, budget-out at 2" test: added after the measuring run.

## Open questions or contradictions found

1. **The handle seam above.** Lead's call. It is the one known double press I could not close from here.
2. **Other double presses, pinned by tests and left alone.** A target that says `unacted` for a press that landed is believed by the engine and the record alike. A step that declared nothing, with no word from the target, is repeated by the engine: only `engine/` could change that.
3. **Rerun of a saved lasting step only checks** (`runtime/llm/node-tools/rerun-check.ts`). It treats the act as already done because the step's own earlier run did it, even when this attempt's run just failed on it, so a rerun onto a renamed control presses nothing. My scripted repair writes a new step, drops the old one and runs forward. The round's note says "Fix that step", so a real model may try `rerun` first. Worth a look before a live run.
4. **The runner ignores the Flow's size setting** (`detached/execution.ts:66` validates at the default of 100 nodes). A bigger Flow assembles under a raised setting, then is refused as `candidate.execution_plan_invalid`. It is not an ending, but such a Flow can never run whole. This is why the step-bound test trips through retries (twelve steps of up to 25 attempts) rather than through length.
5. **The path word on a run that sent nothing.** After a Stop on a one-press Flow, the next attempt is judged yes with 0 live steps and reads `explore` with source `exploration`, by the design's rule. No exploration happened.
6. **A host's `not_landed` reads as done in the run.** The gate cannot see the effect check, so later steps run as if the press happened. Safe against a double press, but a later step could act on a page the press never changed.
7. **Nothing to judge.** A Flow with no rows and no declared act has nothing for the judge to read after a whole run, so it goes to the rounds. Not an ending.
