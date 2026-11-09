# W5: a saved Flow's run puts a robot check to the person in place

## Outcome

Done. In Answer First, a saved Flow's run that meets a check only a person can clear now asks the person on the Flow's thread. It waits with no deadline, then carries on from that step down the engine's success route. Any other question raised mid-Flow (a permission, a PIN or anything else that parks) still reaches nobody, and the run stops there. The failing step is described in the same words as before.

## What changed and why

All paths are under `packages/fluxiq/src/framework/automation-service/service/answer-first/`.

- `flow-run/person-check-port.ts` (new, lines 1-51). `automationStudioAnswerFirstFlowRunPersonCheckPort(personCheck, refused)` returns the run's parking port, or `undefined` when there is no person or the port cannot wait in place.
  - It wraps the given port in `automationStudioAnswerFirstUnboundedPort`, so the ask is opened with `timeoutMs: null, onTimeout: null` and waited on with only the signal. The engine's `expiresAtMs` is dropped and only an answer or the run's signal (the person's Stop) ends the wait. `waiting("started"/"ended", ms)` is reported.
  - `open` passes on only asks whose `control.kind === AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND` (`person_check`).
  - Any other ask that parks is refused: `open` calls `refused()` and throws. The engine then ends the run at that node (`ask-or-park.ts` `openAutomationStudioAsk`, "could not be delivered") and nobody is asked.
  - An ask that does not park is a no-op and the run proceeds. That is what an unbound run did.
  - `awaitAnswer` refuses any ask that is not a check, as a guard.
  - If the port has no `awaitAnswer`, it returns `undefined` (no port), so the run never parks durably on a question nobody waits on.
- `flow-run/ports.ts`
  - Line 6: imports `AutomationStudioParkingPort`.
  - Lines 43-47: new optional port `personCheck?: { port; waiting(state, waitedMs) }`.
- `flow-run/flow-run.ts`
  - Lines 23-26: header paragraph.
  - Lines 35 and 48: imports.
  - Lines 102-104: builds the port and records `askedNobody` when it refuses.
  - Line 117: passes `askedNobody` into the ended record.
  - Lines 122-129: `gatedOptions` still drops the engine's own parking port (the run-subject thread) and binds the attempt's person-check port instead.
- `flow-run/steps-ran.ts`
  - Lines 68-69: `Ended.askedNobody`.
  - Lines 150 and 161-162: `traceSaid` gives the same words as before ("This step stopped for a person's answer, and a saved Flow's run asks nobody part way through.") when the port refused. The engine now ends that trace `failed` ("could not be delivered") rather than `waiting`, so without this the model would have been given different words.
- `flow-run/permission.ts` lines 7-9: header comment updated (it said the run is given no parking port).
- `flow-run/index.ts` line 9: barrel export of the new port function. The tests import it through the barrel.
- **Outside `flow-run/`, kept minimal: `attempt/flow-stage.ts`.** This is where `personAsk` is handed to the flow-run ports.
  - Lines 18-20: header note.
  - Lines 66-72: passes `personCheck: { port: input.personAsk.port, waiting }` when `input.personAsk` is set. `waiting` sets `run.waitingFor = "person_only_check"` while the wait stands and clears it after, adds the time to `run.waitedMs`, and saves the attempt (`automationStudioAnswerFirstKeep`). This is the same three lines as `attempt/round.ts` `personWaiting`. I copied them rather than exporting from `round.ts`, so no other file changed.
  - The port is `input.personAsk.port`, the Flow-subject conversation port from `service.ts:1567`. It is not wrapped in `automationStudioActivityAskPort`, because the engine already emits the waiting and resolved activity in `ask-or-park.ts`.
- `flow-run/tests/person-check-port.test.ts` (new, real-sql group, 7 tests):
  - Unit: the port waits on Core's real `automationStudioConversationParkingPort` under fake timers. After 10 minutes nothing expires and `expireAsk` is never called. The person's answer ends the wait. A control case shows that the same wait on the bare port does expire at 5 minutes.
  - Unit: permission and PIN asks are refused at `open` and the person port never sees them. An ask that does not park passes silently.
  - Unit: no port is returned with no person, or with a port that cannot wait in place.
  - Test 1: on the real engine, a robot check at step 2 of 3 parks. The person presses Continue. The run reaches its end, step 1 is not run again (`reads === 2`), the ask has `timeoutMs: null`, `awaitAnswer` gets no `expiresAtMs`, and waiting is reported as started then ended.
  - Test 3: nobody answers. After 300 ms the run has not ended, waiting has been reported as started, there is no `expiresAtMs` and `timeoutMs` is null. The person's Stop then gives `{ kind: "stopped" }`.
  - Test 2 (`it.each`): a permission ask and a PIN ask mid-Flow are never put to the person. The run stops at step 2 with the earlier "asks nobody" words and step 3 does not run.

## Commands run and observed results

All commands were run from `C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQ`, one at a time and never together.

1. `npx vitest run src/.../flow-run/tests/person-check-port.test.ts --maxWorkers 2 --minWorkers 1` (from `packages/fluxiq`) -> `Tests 7 passed (7)`.
2. Negative control, parking port not bound (temporary edit, reverted) -> `Tests 2 failed | 5 passed (7)`. The Continue test failed (`expected { ... } to match object { kind: 'ran', reachedEnd: true }`) and the nobody-answers test timed out. The permission and PIN tests still passed, which matches the old behaviour.
3. Negative control, check filter disabled (temporary edit, reverted) -> `Tests 3 failed | 4 passed (7)`: the refuse unit test failed (`promise resolved "undefined" instead of rejecting`) and so did both the permission and PIN run tests.
4. `npx vitest run src/.../flow-run/tests --maxWorkers 2 --minWorkers 1` (after restoring, and again after the test-file fix) -> `Test Files 11 passed (11)`, `Tests 69 passed (69)`, Duration 134.32s.
5. `pnpm --filter fluxiq check`:
   - First run, with an `as never` stub in the test -> exit 0.
   - After rewriting that stub, it failed with exit 2 on two readonly-array assignments in the test helper.
   - Fixed, then -> exit 0 (`"step":"fluxiq:check", ... stored`).
6. `pnpm structure:check`:
   - First run -> exit 1, with two violations in the new test: `[as-never]` at line 65 and `[statement-packing]` at line 77.
   - Fixed with a typed `storedOf` helper and one statement per line, then -> `structure-audit: passed (531 warning(s), 1097 baselined)`, exit 0.
   - The only warning on my files is advisory: `flow-run/: 17 source files is past the 15-file advisory threshold` (it was already 16, and the limit that fails is 25).

## Not verified

- No live or Lab run and no browser. The Lab's person playing Continue on the Flow-subject thread for a run's check was not exercised. Run run-mw48lhrd-b5f0f3cb was not re-run.
- The attempt row reading `waiting_for_person` / `person_only_check` is not covered by a test at attempt level. Only the `waiting` port callback is tested, at the flow-run level. The `flow-stage.ts` wiring was checked by typecheck only; no `attempt/` or `answer-first/tests/` suites were run.
- A check met inside a child Flow (a repeat's sub-Flow) is still bounded by that child's `executionDefaults.timeoutMs` deadline (`engine/automation/composite/boundary.ts:61`, `child-bounds.ts`). Detached runs copy the parent Flow's `executionDefaults` to children, so a person's wait there can be cut off by the child's deadline. This is the engine, which I may not touch.
- The engine allows at most 3 person asks per run (`AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN`). After that the run ends. This was not changed or tested.

## Open questions or contradictions found

- A non-check parked ask now ends the engine trace as `failed` ("could not be delivered") instead of `waiting`. `steps-ran` keeps the same words for the model through `askedNobody`, but anything that reads the raw trace status, such as the step log note from `stopped-note.ts` or trace consumers, now sees `failed` with no failure record. The brief allowed "the port refuses"; flagging it in case the lead wants trace parity.
- The person's own Stop option on the check (`person_stop`) sends the run down `failed`. Like nobody answering on the old path, that ends this run as a failing step, with "a person was needed ... the person pressed Stop", and the attempt goes on to the rounds. It does not end the attempt. Only the attempt-level Stop (the cancellation signal) reads as `stopped`. The brief did not say which was meant.

```text
Outcome: Done
Changed: packages/fluxiq/src/framework/automation-service/service/answer-first/flow-run/{person-check-port.ts (new), flow-run.ts, ports.ts, steps-ran.ts, permission.ts, index.ts, tests/person-check-port.test.ts (new)}; packages/fluxiq/src/framework/automation-service/service/answer-first/attempt/flow-stage.ts
Validation: `vitest run .../flow-run/tests --maxWorkers 2` -> 11 files, 69 tests passed; `pnpm --filter fluxiq check` -> exit 0; `pnpm structure:check` -> passed (531 warnings, 1097 baselined)
Not verified: live/Lab run; attempt-level waiting_for_person row (only the callback is tested); a check inside a child Flow is still bounded by the child's deadline (engine)
Report: C:/Users/osrs_/FluxStuff/fxwork/t877/!FluxIQ/docs/working/answer-first-plan/reports/live/lane-c/w5-flow-run-person-port.md
Notes: Non-check parked asks are refused at open, so the engine trace reads failed, not waiting; steps-ran keeps the old words via askedNobody.
Negative controls confirmed: without the port, the Continue and nobody-answers tests fail; without the check filter, the permission, PIN and refuse tests fail.
```
