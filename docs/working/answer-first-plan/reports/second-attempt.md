# The second attempt (t870)

Worktrees `fxwork/t870/!FluxIQ` and `fxwork/t870/!FluxIQWebExtension`, branch `task/t870-second-attempt`. Provider-free throughout: a scripted model and a fake lending library, on the real service and the real engine. No paid call, no real site, no real key, no Lab, no browser. `AF/` = `packages/fluxiq/src/framework/automation-service/service/answer-first`, `AR/` = `packages/fluxiq/src/runtime/answer-first/act-record`.

Worker reports and the design are in `second-attempt/`: `design.md`, `memory.md`, `acts.md`, `flow-run.md`, `driver.md`, `carry-on.md`, `permission-words.md`, `proof.md`, `closing-holes.md`, `apply-proven.md`, `skipped-rows.md`, `identical-rows.md`, `merge-dev.md`.

## Outcome

**Built and proven only with a scripted model.** A later attempt at the same task finds the saved Flow, runs it live and judged, repairs it from the page it left, carries on to the result when repair does not get there, and keeps the better Flow. A task still ends only with its result, its budget gone or a person's Stop. Nothing has seen a real model, a real site or a real domain's answers.

| Case | Attempt | Path | Calls | Dollars (mock prices) |
| --- | --- | --- | --- | --- |
| The Flow holds | 1 | `explore` | 7 | 0.0065 |
| | 2 and 3 | `run_flow`, no decision, one judge | 2 | 0.0015 |
| It breaks at the row's own step | 2, then 3 | `run_flow_then_repair`, then `run_flow` | 7, then 2 | 0.0065, then 0.0015 |
| Repair fails, carried on by hand | 2 | `run_flow_then_explore` | 11 | 0.0105 |
| Budget-out at 2 of 4, the same words | 1, then 2 | `budget_out`, then `run_flow` | 11, then 2 | 0.011, then 0.0015 |

The two calls on a `run_flow` attempt are the instruction read and the judge. Each row was pressed once in each case; "the same words again" after an achieved attempt presses all of them again, because a person asking again means it.

## What each item came to

| Item | State |
| --- | --- |
| 1. Task key and route | Done. An exact digest of the words and the site's origin (`AF/task-key/`), per project, since the chat makes a new blank Flow per ask. Use, repair or build (`AF/route/`). The chat prompt's false claim about saved drafts is corrected |
| 2. Save, notes, seeding, attempt row | Done. `AF/task-memory/`: the best Flow beside the latest, notes the model writes in its completion at no extra call, acts, provenance with each step's origin, for the Tasks screens |
| 3. The later attempt | Done. The judged run is the engine, not `core.run_flow`'s walker, which follows no route and retries nothing. Repair is the attempt's own loop |
| 4. Add budget and carry on | Done. `AF/carry-on/`. The ceiling is read before the purse opens, from a scope, so `service.ts` and `generate.ts` did not change |
| 5. A Core restart | Done. `AF/interrupted/`. A row not live here reads `waiting_for_person`, reason `interrupted`. A row is written at the opening and taken back on a setup refusal. t869's wiring carries it on |
| 6. Limits | Verified, below |
| 7. Proof | Done, scripted. `AF/tests/second-attempt-proof.test.ts`, `AF/tests/double-act-on-run.test.ts` |

Added by the lead: a proven Flow applies itself (`AF/apply-proven/`); the double-act proof on this path; permission words and the PIN line; identical rows; `skippedAsDone`; the Flow's own size on a run.

## Limits (item 6)

| Limit | Reached here? | What happens |
| --- | --- | --- |
| Recovery and exploration 10 minutes | No | The run refuses any model. A provider is resolved once in the attempt, asserted |
| A run's result-check deadline | No | The Flow-less judge has its own, which stops its call |
| A run's deadline, the step bound | Yes | Each really trips, and ends the run, never the attempt, driven through the service |
| Child Flow's bound | Not from a draft | No draft step can make a Call Flow node. It tripped on the engine, on a real trace fed to the mapper |
| A Flow over 100 nodes | Fixed | The run took the default size, so a long Flow assembled and then could never run whole. It now takes the Flow's size, and the step bound follows it. Test: 270 nodes run whole |

## Double acts

What stops the second press in the classic double act, a press that landed and then an error, is the engine's own guard: one node call, one press. Retries reach a lasting step only when the failure says it did not act. The gate is the second line. The full table is in `proof.md`.

**Still can press twice, each pinned by a known-limit test, in `closing-holes.md`:**

- A control with no row's words and no matching address, on a row already pressed.
- A row's value written differently from the words on the control.
- A control whose words change with the press and whose address counts places.
- A label a later look loses.
- A target that says `unacted` for a press that landed, and a step that declared nothing being repeated by the engine.
- An act no read showed on a row whose value then changed, followed by a press by a printed handle on that row. A test requires that shape to run, because it cannot be told from a different row sharing a value (`AR/tests/row-shapes.test.ts`, `merge-dev.md`). By reading, the web domain's rows print no handle, so it is not expected to be reached there.

**Core reads no page.** An act in doubt is refused once and told, and only a look after that opens it, but whether to press after that look is the model's reading. For a real model this is the weakest point.

**The Lab's double-act oracle.** On dev's live driver it is on for every attempt that runs: the baseline is read before each attempt and the change judged after. `attempt-lane/live/run-attempt-command.ts` passes `attempts: 1` today, so attempt 2 needs that raised. The series reseeds the site between attempts, so a double act within an attempt is caught and one across attempts is not. The lead has passed that to t869, which owns the driver.

## What I decided, for you to overrule

1. **The engine is the judged run.** Accepted by the lead, on the condition of the double-act proof, which ran.
2. **Later attempts after an achieved one carry no acts; after anything else they carry landed and may-have-landed.**
3. **`later_attempt` refuses a carry-on when a later attempt exists,** beyond the brief. Accepted by the lead: it only ever presses less.
4. **"Skipped 1 as already done" also shows on an ordinary first attempt** that presses row one by hand and runs forward. It is true and a little odd. The point is that a person sees any row left out, so it stays.
5. **A failed node that says nothing of what happened is may-have-landed,** not "nothing". It matches the engine's own reading.
6. **`run_flow` on a Stop or budget-out with no later decision,** because nothing was worked out. t871 shows its words only on `achieved`.

7. **One clause in t869's `same-row.ts`** (`merge-dev.md`). A row all of whose values lie in another may be that row, where the fit would otherwise be nothing, because t869's rule alone pressed twice on an act known only by a column every row holds. It only ever holds more rows done. Its cost: an act on `{action: "Accept"}` alone holds every later "Accept" row done. Those rows are left out, and the card counts them.

The lead overruled one: rows nothing separates burning the budget on refusals. They are still refused, and the ladder now asks the person with money left, pinned at under half of an $0.08 purse.

## Per-worker summary

| Worker | Tier | Brief | Outcome and what I verified |
| --- | --- | --- | --- |
| route and memory | `worker` | Key, memory, route, better-Flow, notes | Done. Re-ran tests |
| acts | `worker-heavy` | Row shapes, settling, begun-before-sent, seed | Done. Re-ran tests |
| flow run | `worker-heavy` | Engine run, permission, rows | Done. Re-ran tests. Applied `record.doubted` myself |
| driver | `worker-heavy` | Wiring the attempt | Done. Re-ran tests |
| carry-on | `worker-heavy` | Carry on, interrupted, acts per task | Done. Re-ran tests |
| permission words | `worker` | Naming the control | Done. Re-ran tests |
| proof | `worker-heavy` | Proof and double-act proof | Partial, as it said: three defects fixed, one double press left, which the next closed |
| closing holes | `worker-heavy` | Press by unprinted handle; look-after-refusal | Done. Re-ran tests |
| apply proven | `worker-heavy` | Apply on a proven run | Done. Re-ran tests, with the older helper now keeping the digest, so the apply runs through the whole folder |
| skipped rows | `worker` | Contract, card, count | Stopped short of a passing service test, finished by the next |
| identical rows | `worker-heavy` | Finished what a session restart stopped | Done. Re-ran tests |
| merge of dev | `worker-heavy` | The eight conflicts with t869's rule | Done. No test of either lane edited to fit; two added, which reach elimination. Re-ran all checks |

Twelve against the "about 6" you allowed, as the lead widened the lane. One `Explore` at Haiku mapped the engine paths at the start. A worker on the restart lost its place in the middle of its edit, and the next read what was there before changing anything.

## Integration changes I made

- `prompt.ts`: the false claim. `action-permissions/request.ts`: the sentence is now `FluxIQ needs to press "X".`, with `each time this runs` where true and the prefix in recovery. Every client lists what it would do from `missing` beside it. `respond.ts`: "confirm it here, or cancel".
- `detached/execution.ts`: optional `size`. `flow-run/step-bound.ts`: the step bound follows the Flow.
- `attempt/call-chain.ts`, `gate/act-gate.ts`: a press by hand takes its own answer's `draft.control`.
- `attempt-store/store.ts`: `remove`, as the lead allowed. `attempt/run-attempt.ts`: a row at the opening.
- `loop-detection/detector.ts`: refused acts counted by act across pages, because a clock on the page escaped the ladder until $0.054 of $0.08. `carry-on/prior.ts`, `attempt/keep.ts`: the skipped count survives a press.
- `flow-run/flow-run.ts`: `record.doubted` after a verification failure. `tests/later-attempts.ts`: the same goal keeps the digest.
- `docs/architecture/automation-studio/llm-flow-bootstrap.md`: "Later attempts at the same task".

## Commands run and observed results

On the merged tree, dev under it, before it was committed:

```text
(packages/fluxiq) pnpm.cmd exec vitest run src/runtime/answer-first src/runtime/llm/repeat-guard src/framework/automation-service/service/answer-first --minWorkers 1 --maxWorkers 2
 Test Files  95 passed (95)    Tests  1003 passed (1003)    exit 0
(packages/ui-components) pnpm.cmd exec vitest run src/chat/answer src/chat/ports src/testing/results --minWorkers 1 --maxWorkers 2
 Test Files  6 passed (6)      Tests  70 passed (70)
(root) node scripts/structure-audit.mjs     structure-audit: passed (504 warning(s), 1097 baselined).
(root) pnpm.cmd --filter fluxiq check       0 "error TS" lines
```

Extension, on 1b75cf4a3 (dev merged under it), against this merged Core rebuilt:

```text
(root) pnpm.cmd --filter @fluxiq-web-extension/domain check     0 "error TS" lines
(domain) node scripts/test-domain.mjs node-run/tests/labelled-press/tests/identity node-run/tests/call-words plan-resolution/tests/plan-step-permission     # pass 33, # fail 0
(root) node scripts/structure-audit.mjs     structure-audit: passed (240 warning(s), 552 baselined).
```

An earlier wider run, on 555363c6c's tree before the merge, also covered action-permissions, candidate-trial and the detached run's verification: 133 files, 1361 passed, 2 skipped (`process-restart.test.ts`, its own conditional skip).

## Not verified

- **Any real model or judge.** Whether a real model finds these repairs, or a real judge says yes, is not shown.
- **Real domain answers.** Row shapes, failure records and `actedOn` sentences are written from the code. `resolvePlanNodeParameters` on real saved steps is unproven.
- **A real process kill.** The restart is a second service over the same data.
- **Stale-target re-find on this path.** It comes from the run's defaults, not retested.
- **New rows that land with no page change, past 12 in a row,** by reading: steered as ever.
- **The chat's display** of the ask and the card line, in a browser.

## Open questions

1. **Applying without a `candidateTrial`** means a later playback's double-no hold has no build trial to hold to. Accepted by the lead.
2. **The Lab's `attempts: 1`** is the lead's to raise for attempt 2.
