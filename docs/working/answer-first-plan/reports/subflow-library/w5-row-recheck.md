# w5: a lasting step bound to a list row can run, and a part is refused beside another run

## Outcome

Done. Both fixes are in the t866 worktrees, uncommitted. A headed job-board run with a provider that throws proves each intended row saved exactly once, the right rows pressed after a reorder, a removed row reported gone with no press, and a second part refused with the site unchanged. Two edits lie outside the owned list, both needed by the brief: one word in `api-contracts/automation/project-part.ts` and one port on `service.ts:455` (see Seams).

## Fix 1: mechanism and why

**Before each attempt of a lasting row-bound step, the gate asks the engine to find the row again, then asks the page about that row's control.**

1. **Checkpoint input.** `AutomationStudioRunCheckpoint` gains one optional method, `recheckRow()` (`runtime/automation-host/control.ts`). `graph-run.ts` passes a closure over the frame's own loop context. Nothing happens unless a gate calls it, and the run controller reads only `nodeId` and `step`, so existing gates are unchanged (`engine/automation/tests/graph-run.test.ts` and `run-control` pass). A closure rather than values on the input, because the re-find needs the frame's context and no reader but this gate should pay for it. It works in every frame, so a part that calls a part is covered.
2. **The re-find is the t786 one, not a second one.** `target-reacquire/row-recheck.ts` calls `automationStudioReacquireFromSource`, which is `step-reacquire.ts`'s private `reacquire` exported with its `failure` passed in: read-only check, return to the source's place, internal source re-run, the host's identity match, and the fresh row written over the pass's row. `lineage.ts` gains `automationStudioRowLoopOf`, so a step handed a row whose list has no source in this graph is `unavailable`, not treated as having no row.
3. **Which control, for this row.** Core cannot read the web's element form, and the row's scoping lives in the domain (`row-scope.ts`), which this brief does not own. So `run/row-target.ts` runs the step's own implementation with the row and reads what it would send: for an importer node with `outputAction`, execution only hands back a `policy.output.dispatch` effect, and the executor is what sends it. The parameters go to the page unread as a `visible` fact. `dom-page.ts` resolves that fact through `resolveTarget`, so check and press answer by the same rule, including `resolvedForPass` and the ambiguity refusal. **Any other node is never asked**, because running it would be doing it; that step stops as "could not be checked".
4. **The gate** (`run/step-gate.ts`): classes, then permission, per step as before, then the row. `no_row` keeps the once-only look. `found` is checked every time, including each retry. `done` passes, because the run's ledger already holds that row's act and arrival skips it. Everything else stops with no press.

**A pass that already left the list is not sent back.** In `open the row's page, then press`, re-reading the list would navigate the page away from the press. So once an earlier step of the pass may have moved the page (anything but Core's control and wait nodes or a domain step with effect class `observe`), there is no re-read and the page is asked only about the control for the row the run holds. This is a deliberate weakening for that shape. The row was already used by identity by the step that opened its page, and the press still resolves by the row's values.

**The press itself still has the page's gate.** Pace, On Before handlers and readiness run between the gate and the dispatch, so a page can still shift in that window. The dispatched press carries the row's values and the page resolves it inside that row or refuses, so that window can fail a press but should not move it to another row.

### What the requirements came to

| Requirement | How |
|---|---|
| By identity, never position or handle | Host's `reacquireTarget`; the reordered run below |
| Before every row's press | `recheckRow` on every ask for a row-bound step |
| Non-row step keeps once-only | Test "keeps the once-only look" |
| Row gone: reported, no press | `row_gone`: "The item this step was for is gone from the page, so it was not done, and the items after it were not tried." |
| Ambiguous or unreadable stops | `unmatched` becomes `row_unclear`; `unavailable` becomes `row_unread`; `visible` `unknown` becomes `not_read` |
| Uncertain act not repeated | The engine's rule, untouched: effect check, then Outcome uncertain. Tested: one press, no later row |
| Source must be read-only | `automationStudioReacquireSourceReadOnly`, as t786. Tested: a source that says nothing about itself is not re-run |
| Permission and class per step | Unchanged, and asked first, so a no needs no read |

### Remaining rows after a gone row: the run stops

**The rows after a gone row are not tried.** That follows the engine: `automationStudioTargetGoneAttempt` is `target_not_found`, not retried, and takes the failure path, where `defensive/continuation.ts:114` says a lasting act that failed is not walked past. The run keeps today's sticky gate stop. The spec shows it: the row before is saved, the removed one is not pressed, the one after is not tried.

**One difference from the engine.** A step with a written `on failed:` route, `optional`, or `onFailure: continue` would continue on the engine's path. The brief limits `graph-run.ts` to the checkpoint's input, so a gate cannot take a route, and those steps stop here too. It errs towards no press, but such a part ends earlier than its author wrote. The lead may want this changed.

## Fix 2: what the gate search found

**No gate covers person-started runs.** What exists:

- `runtime-session/admission.ts:21,31` refuses a second run only among `metadata.adaptiveRuntime === true` sessions.
- `service.ts:2464,2466` passes `adaptiveRunRequested`, and a plain Flow run (`no_llm_intervention`) is admitted with no check at all.
- `runtime-session/build-trial-admission.ts:37,43` holds a build's trial to its brief's lease and counts nothing.
- `runtime/flow-authoring/bootstrap/candidate/trial/gate.ts` is about when a model may finish a candidate. It has nothing to do with concurrent runs.
- `runtime/project-agents/dispatch/host-lease.ts:12` and `dispatcher.ts:69` are the lease a build holds, with `project-build/run.ts:237` choosing the port. `host-resources/lease-scope.ts:47` with `client-gateway/service/host-lease/stamp.ts:31` refuses unleased commands to that browser session. Plain Flow runs hold no lease.

**So `run/driving-gate.ts` asks both, with no new lock:**

- **The lease.** A part run takes the lease a build uses, from before it reads the page until it ends. If the host's lease is held or a holder is waiting, it refuses at once. A build's call from inside its own lease scope is that run, and takes nothing. A person's call never trusts a scope.
- **The session gate.** `admitAutomationStudioRuntimeSession` itself, with a listing that marks every active session as counting, because only this can see a plain Flow run. For a build, sessions under a build's lease (`subflowTrial`, `candidateTrial`, `explorationAttempt`, a build's `partRun`) do not count: they are its own, or on a resource that shares nothing. A listing that fails refuses, as the gate does.

**Answers.** A person gets `part.run_in_progress`: "Another run is using this project's page right now, so this part was not run and nothing changed. Try again when that run has ended." A build gets the same through `core.run_part` as an ordinary tool answer (`effectApplied: false`), never an ending; tested through the real bundle.

**Behaviour to know about:**

1. **A Flow run started during a part is not refused at its start.** Starting one asks nothing of parts. Its commands are then refused `host_lease.missing` while the part holds the lease, exactly as during a build. I read this path and did not run it.
2. **A parked (`waiting`) run refuses parts until it ends or expires,** because the gate's active statuses include it.
3. **A port that holds back a lease with nothing held** (no browser paired, or two) is not treated as another run. After 1s the part goes on unleased, as it does today, and the guard's read of the page decides. So with two browsers paired a person's part runs unleased while a build would not start. I chose this so "no browser" answers as today rather than as "another run".
4. **A host with no `hostResources` has no lease to take**, so only sessions protect it, and two part runs starting together could both pass. No real host is like this. I could not use `AUTOMATION_STUDIO_PROJECT_BUILD_LOCAL_HOST`: `project-build/` has no barrel export for it, and the audit refuses the deep import.
5. **Each part run now reads every session in the project** (`listRuntimeSessions`), as an adaptive run's admission does. Refusals went from about 20ms to about 100-200ms in the spec.

## Proof: quoted spec output

`part-run-job-board.spec.ts`, new test, job-board, headed, provider throws after the build (`providerCalls` asserted 0), site state read from the Lab's `/__control/final-state` and My jobs. A real scripted build saved the part: type the words, read, wait, `web.dom.click` with `repeat over: read`, `repeat most: 3`.

```
{"partRunRows":{"status":"succeeded","acts":["modify_existing"],"stoppedAt":null,"clicks":4,"reads":5,"ms":34278}}
{"partRunSecond":{"code":"part.run_in_progress","message":"Another run is using this project's page right now, so this part was not run and nothing changed. Try again when that run has ended.","commands":[],"ms":31}}
{"partRunReordered":{"order":["a31866ada1ad54e1","cfd0c88d3e2dfda1","adb4d94f9665710b","116900366eecf508"]}}
{"partRunRowsMoved":{"status":"succeeded","stoppedAt":null,"clicks":4,"reads":5,"ms":34366}}
{"partRunRowGone":{"status":"stopped","acts":["modify_existing"],"stoppedAt":{"stepLabel":"keep the role","reason":"The item this step was for is gone from the page, so it was not done, and the items after it were not tried."},"clicks":2,"reads":4,"ms":25933}}
  1 passed (5.4m)
```

- **(a)** The Lab's `saved` equals the start plus exactly the three intended keys, and My jobs lists each title once. The heart is a toggle, so a second press would have unsaved a job. Four clicks for three rows: the board fails the first save of a page load, and the retry looked at the row again first. Five reads: one, plus one before each of four presses.
- **(b) reordered.** The test waits until the read is done, then reverses the list in the page. It asserts from the part's own output that the read saw the page before it moved, and that an intended row now stands after a row the part does not mean. Saved is exactly the intended keys. **An earlier run failed in this scene, and it shows what the check looks like when it catches something:** my test reordered too soon, the first read saw the reversed list, and the wrong three rows were saved. I added the assertion on what the read saw and moved the reorder later; I did not change the runner for it. That earlier failure's cause is inferred from which rows were saved, not read from a log.
- **(b) removed.** Saved is the start plus the row before the removed one. The removed row and the one after it are not saved. Two clicks, both on the first row, and four reads.
- **(c)** The second part is refused in 31ms, sends the site no commands, and the board's state string is equal before and after; the first part then finishes as (a).

Screenshots, both looked at:
- `apps/extension/e2e/test-results/content/artifacts/part-run-tests-part-run-jo-89b86-part-refused-while-one-runs/after-rows-my-jobs.png`: "5 saved jobs", the three intended and the board's two, one heart each.
- `.../after-row-gone-page.png`: the first card's heart filled, later hearts empty, the removed role absent.

These artifacts are overwritten by a rerun of that test; the screenshots looked at came from a run before two later small edits, and the same scenes were rerun and passed on the final code.

The existing test ("a saved part runs at zero model calls behind its guard") also passes on the final code, `1 passed (7.3m)`.

## Commands run and observed results

All in the t866 worktrees, on the final code unless said. The other worker's tree was live throughout; nothing of theirs blocked these.

- From `packages/fluxiq`: `pnpm.cmd exec vitest run src/framework/automation-service/service/project-parts/run src/runtime/project-parts/guard src/engine/automation/target-reacquire --minWorkers 1 --maxWorkers 2` -> `Test Files 5 passed (5)`, `Tests 106 passed (106)`. New: `row-recheck.test.ts` and `driving-gate.test.ts` (14). An earlier run under heavy machine load timed out the first test of two files at 60s while modules loaded; the same tests then passed with no change to them.
- From `packages/fluxiq`: `pnpm.cmd exec vitest run src/engine/automation/tests/graph-run.test.ts src/framework/automation-service/run-control src/engine/automation/outside-graph/tests/reacquire.test.ts --minWorkers 1 --maxWorkers 2` -> `Test Files 5 passed (5)`, `Tests 48 passed (48)`. Beyond the brief, for the `graph-run.ts` line and the re-find's export.
- Core root: `pnpm.cmd --filter fluxiq check` -> build-cache `"step":"fluxiq:check"`, exit 0, no `error TS`.
- Core root: `node scripts/structure-audit.mjs` -> `structure-audit: passed (499 warning(s), 1097 baselined).`
- Core root: `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build` -> each `Done`.
- `apps/extension`: `pnpm run test:e2e:build` -> the build step reported `extension:build` and verified its files.
- `apps/extension`: `pnpm.cmd run test:content e2e/content/tests/part-run/tests/part-run-job-board.spec.ts --headed --workers=1 -g "presses on each row"` -> `1 passed (5.4m)`.
- Same with `-g "a saved part runs at zero"` -> `1 passed (7.3m)`. The two tests were run one at a time, because together they pass the 10-minute limit of one command; they were not run in a single invocation.
- Extension root: `node scripts/structure-audit.mjs` -> `structure-audit: passed (236 warning(s), 553 baselined).` `pnpm.cmd --filter @fluxiq-web-extension/extension check` -> exit 0.
- `wc -l service.ts` -> 4304.

## Not verified

- **A plain Flow run, or a build, actually running beside a part in a browser.** The spec's refusal is part against part. Person against Flow run, person against a build's lease, and a build refused are proven with the real gate, scheduler and tool bundle, but a fake host and domain.
- **Commands of a Flow run being refused during a part** (behaviour 1): read, not run.
- **A real `open the row's page, then press` part.** Proven with fakes only.
- **`core.run_part` in a real build loop,** still not offered (w4's seam at `service.ts:1574`).
- **A list read without `recordOutput`.** `automationStudioReacquireSourceReadOnly` asks for an observe mark or a record output on the node. I did not check whether a script's plain list carries one. If it does not, such a part stops with "could not be read again" and nothing pressed. I found nothing that stamps one (`record-output-contract.ts:100` reads the definition's `recordsPath`, not the node's), but I did not read a saved plain list node. **This is the shape of the script format's own per-row example, so the lead should have it checked**, as it could stop many real row parts. Widening it would change the t786 reader, which this brief does not allow.
- **A real row with a recorded `routeSignatures.before`.** The press was written, not explored, so it has none; the comparison runs per row and is tested only without a signature on rows.
- **A person's Stop during a row's re-check.** `outcome.ts` now reads a stop before the gate's reason; nobody pressed anything.
- Firefox, the other nine scenarios, and full suites.

## Open questions and things found

1. **A row in a parent frame with its press in a called part cannot be row-bound.** A call step takes no `item`, so a press inside the called part is not scoped to the row, and its lineage is none. `read, repeat over: call action part` keeps today's non-row rule. On look-alike controls it stops at its first press because `visible` is `unknown`, so it should not press a wrong row, but **a unique control would pass once and later passes are not looked at**. What works and is tested is a part calling a part that does its own read and per-row press. If "a site subflow calling an action sub-subflow" means the row crosses the call, that needs a way to hand the row in, which is a Core graph change.
2. **A limited read can report a row gone that only moved.** With `extractList.maxItems` or pagination, a row pushed past the read's limit reads as gone. It stops with no press, so it errs safely, but the word is not always exact.
3. **A row shown twice stops the run.** A sponsored card that is also a result gives two rows with the same words, so by this rule a part on "rust" on the board should stop at that row with nothing pressed (read, not run). The spec uses "manager" for this reason. This is the identity rule working as asked, but a person may be surprised by it.
4. **Each press costs a read of the list:** about 34s for three rows on the board including its 6s wait. Not measured separately on a large list.
5. **Docs.** `docs/architecture/automation-studio.md` and `client-gateway.md` do not describe `part.run_in_progress` or the checkpoint's new method; shared docs were off limits, and the substantial-change rule applies on merge.

## Seams needing the lead

**Edits outside the owned list, each required by the brief:**

- `packages/fluxiq/src/api-contracts/automation/project-part.ts`: `"part.run_in_progress"` added to the closed code list. The handler's response type is built from it.
- `framework/automation-service/service.ts:455`: `driving: { admissions, listRuntimeSessions }` added to the existing `run` object, on the same line. Still 4304 lines. The file's diff also holds two other changed lines I did not write.

**Inside the owned paths but touching existing behaviour:** `step-reacquire.ts`'s private function is exported with a `failure` parameter, and `lineage.ts` had its loop search extracted. `run-part.test.ts` gained the new port. `row-recheck.ts`'s callers are only the checkpoint closure.
