# w8: Stop on a mid-Flow robot check stops the attempt

Outcome: Partial (code and port-level tests pass; `pnpm structure:check` fails on 15 import cycles under `runtime/**`, not my files; no attempt-level test).

## What changed
- `answer-first/flow-run/ports.ts` (personCheck, ~47-52): optional `stopped?()` callback.
- `answer-first/flow-run/person-check-port.ts` (import line 21; header comment; `awaitAnswer` ~42-49): when the answer is `choice` / `person_stop`, calls `person.stopped?.()`, still returns the answer (engine goes down `failed` as before). Continue unchanged.
- `answer-first/attempt/flow-stage.ts` (`personStopped` flag ~57, `stopped` wired in `personCheck`, early `return "stopped_by_person"` before `judged`/`endedBy`): the attempt ends as the attempt's own Stop does; no judge call, no round, no model call.
- `flow-run/tests/person-check-port.test.ts`: `person()` takes "stop", counts `stopped`; new tests: port tells `stopped` on Stop and not on Continue; full run with Stop calls `stopped` once and ends not-reached with one read. Existing Continue test passes unchanged.

## Commands
- vitest `--maxWorkers 2 --minWorkers 1` on person-check-port.test.ts -> 1 file, 9 tests passed.
- `pnpm --filter fluxiq check` -> exit 0 (note: "inputs changed while it ran", the other worker is editing).
- `pnpm structure:check` -> exit 1, "15 violation(s) across 1 rule(s)": import-cycle rule, chains through `runtime/llm/node-tools/replay`, `runtime/flow-authoring/bootstrap/authoring`, `runtime/llm/step-log`. None in my files (grep of the output for answer-first paths shows warnings only). Not run on a clean baseline, so I cannot say whether they predate the other worker's edits.

## Not verified
- No attempt-level test (flow-stage returning `stopped_by_person` through the real service): the harness lives in `answer-first/tests/`, outside my ownership; flow-stage change is covered only by typecheck.
- The engine's failed route after Stop still runs whatever the step's `failed` route holds before the run returns (no steps after it in the test); the attempt then ends without judge or rounds.

## Open
- Structure cycles in `runtime/**` need their owner.
