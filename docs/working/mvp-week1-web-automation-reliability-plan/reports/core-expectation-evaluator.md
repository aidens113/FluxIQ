# Report: core-expectation-evaluator (C3)

Worker: `core-expectation-evaluator`. The worker was interrupted by a machine
failure before it wrote this report, so the senior supervisor agent reconstructed
it on 2026-09-12 by reading the working tree it left behind and re-running every
gate. Everything below is the supervisor's own observation, not a worker claim.

## Outcome

**Done.** The seam exists, is reachable from both call sites the brief named, is
covered by tests, and every Core gate passes.

## The shape it landed in, which is not the shape the brief described

The brief said to bind the evaluator beside `bindHostRuntime` in
`runtime/service.ts`, implying a separate `bindExpectationEvaluator` method. It
was instead added as an optional method **on `AutomationStudioHostRuntimeBoundary`
itself**:

```ts
expectationEvaluator?(
  conditions: JsonValue[],
  mode: string,
  timeoutMs: number,
  context: AutomationNodeExpectationEvaluationContext
): AutomationNodeExpectationEvaluation | Promise<AutomationNodeExpectationEvaluation>;
```

The supervisor ratifies this deviation. It is the better design and it satisfies
the brief's actual intent: a host that already binds a runtime boundary gets the
evaluator through the same object and the same `bindHostRuntime` call, so there
is no second binding to forget, and `service.ts` needed no change at all. The
cost is that the downstream side must put its implementation on the boundary
object rather than in a standalone binding, which is why the downstream half was
folded into the `w3-host-runtime` brief rather than briefed separately.

`runtime/executor/contracts.ts`, also named by the brief, needed no change:
`hostRuntime` already reaches node execution through
`AutomationStudioGraphExecutionOptions`.

## What was built

- `nodes/contracts.ts` — `AutomationNodeExpectationEvaluation` (with
  `passed`, `checkedConditionCount`, `message`, `failure`),
  `AutomationNodeExpectationEvaluationContext` (with `source`, `nodeId`,
  `attemptId`, `stateRef`, `signal`), and the evaluator function type. The
  evaluator is carried on `AutomationNodeExecutionContext`.
- `runtime/host-runtime.ts` — the boundary method above, a new
  `expectation-evaluation` capability id, and `hostExpectationEvaluator()`,
  which binds `this` correctly and returns `undefined` when nothing is bound.
- `nodes/policy/expectation.ts` — the node now awaits the evaluator. With none
  bound it keeps its unconditional pass, exactly as before. On rejection it
  routes `failed` and carries the evaluator's own `failure` and `message`, or
  falls back to `core.policy.expectation_rejected` /
  `expected_state_missing` / stage `verification`.
- `runtime/executor/node-execution.ts` — a `finishAttempt` helper that captures
  host state first and then asks for the expectation verdict, so the host is
  asked about the snapshot the attempt actually ended on. Core supplies
  `nodeId`, `attemptId` and `stateRef` so the host does not have to guess which
  attempt is being asked about.
- `runtime/executor/transition-comparison.ts` —
  `attemptWithHostExpectationEvaluation()` asks the bound host to judge
  `expectedState` and recompares with that verdict.
  `compareAutomationStudioTransition` takes an optional third `evaluation`
  argument; `stateCheckCount` prefers the host's `checkedConditionCount` over
  counting expected-state keys, which is the counting behaviour the plan set out
  to remove.

Three guards keep an unbound host bit-for-bit unchanged, and keep a bound host
from being asked twice: the evaluation is skipped when nothing is bound, when
the attempt has no `expectedState`, when the attempt did not succeed (a failed
or waiting attempt is classified from its own outcome), and when the node is
`builtin.policy.expectation`, which already asked the host itself. A throwing
evaluator is caught and the attempt returned untouched, so a faulty host cannot
break a run.

## Validation

Every command run by the supervisor in `F:\!FluxIQ`, status captured by
redirect rather than through a pipe.

| Command | Result |
| --- | --- |
| `pnpm check` | exit 0; structure audit clean |
| `pnpm test` (parallel) | **exit 1 — see below** |
| `npx vitest run --no-file-parallelism` (packages/fluxiq) | exit 0, **128 of 128 files, all tests passed** |
| `pnpm docs:check` | exit 0; 98 authored/reference files linked, framework reference current |
| `pnpm package:lint` | exit 0 |
| `pnpm build` | exit 0 |

`nodes/policy/tests/expectation.test.ts` (4 tests) passes: an unbound host passes
unconditionally, a rejecting evaluator routes `failed` with the fallback failure
record, the evaluator's own message and failure record survive, and an accepting
evaluator is handed exactly `(conditions, "all", 250, { source: "policy_node" })`.
`node-execution.test.ts` and `transition-comparison.test.ts` gained rows for the
wiring and the recomparison.

## The parallel test suite is unsound on this machine, and it is not this work

`pnpm test` fails in parallel and passes sequentially. Three parallel runs each
lost one or two test files to `Error: Worker exited unexpectedly`, and one whole
run died with a segmentation fault; the file lost differed between runs. Running
the same tree with `--no-file-parallelism` gives 128 of 128.

The cause is visible once the crash lands as an assertion instead of a native
death:

```
SQLITE_CORRUPT: malformed database schema (fk_subflows_parent_flog_id_insert)
in src/programs/tests/global-automation-studio-workspaces.test.ts
```

Core's suite uses a native SQLite module, so the same corruption usually kills
the worker process outright rather than failing a test, which is why it presents
as a segfault or a vanished worker. The affected test has nothing to do with
expectations. Do not attribute these crashes to a code change: on this machine,
verify Core with `--no-file-parallelism`, and treat a parallel `pnpm test`
worker crash as an environment result rather than a regression. Raised as an
open question for Core.

A caution for whoever investigates: one clean parallel baseline run does **not**
clear a change. The supervisor stashed this seam, saw a green 127-of-127 parallel
run, and briefly concluded the seam caused the crashes. It did not; the baseline
run was lucky. The sequential run is the sound comparison.

## Notes

- Trigger name `fk_subflows_parent_flog_id_insert` contains a typo (`flog_id`
  for `flow_id`) in existing Core code. Cosmetic, untouched here, but worth a
  look by whoever owns that schema.
