# P2b FluxNode runner: sub-supervisor report

Sub-supervisor: Opus 5.5, worktree `fxwork/t886/!FluxIQ`, branch `task/t886-fluxnode-runner`. Nothing committed.

## Outcome

Done. `await fluxiq.run(node, inputs)` works end to end in tests: the real `@fluxiq/sdk` client calls the
FluxNode HTTP API (`/api/fluxnode/v1`) over loopback. The API is backed by the real runner, and the runner
drives one Answer First attempt per run through `AutomationStudioAnswerFirstCallerOptions` on the
scripted-model fake library site. All seven acceptance scenarios pass. `fluxiq dev` now builds the service
and serves the API in open mode, and prints the K4 warning when it starts.

## Interfaces fixed before dispatch (by me)

- **The stable port.** `service/fluxnode/fluxnode-service.ts` defines `FluxNodeService`, with one method per
  endpoint, plus `FluxNodeCaller` (`owner` / `FluxNodeRunner` / `open_mode`) and the outcome-or-refusal
  union. Nobody changed its signatures.
- **The contracts change (additive; `@fluxiq/contracts` 0.16.0 to 0.17.0):**
  - the run request gains `pipeline` (exactly one of spec, name, resumeHandle, pipeline);
  - the register request takes `{ spec }` or `{ pipeline }`;
  - new `dataPipelineHash`, which a registered pipeline answers as its `specHash`.

  These come with tests: `data/tests/pipeline-hash.test.ts`, `http/tests/register-target.test.ts` and two
  request cases.

## Workers

| Worker | Tier | Brief | Outcome | What I verified |
| --- | --- | --- | --- | --- |
| runner | worker-heavy (Opus) | `createFluxNodeService` and `runFluxNode` in `service/fluxnode/`, plus an `inputs` seam (see below) | Done | Re-ran the fluxiq typecheck, the vitest groups and the audit after integration |
| http-api | worker (Sonnet) | `server/fluxnode-api/`, mounted in the headless listener, open-mode guards, the `runDev` seam and warning | Done | Fixed its fake's missing `name`; the typecheck and `src/server` tests pass |
| engine-fixes | worker-heavy (Opus) | Five handed-forward fixes in `answer-first/` and `contracts/src/task-attempts` | Done | Re-ran the answer-first groups, contracts `src/task-attempts` and the contracts typecheck |
| pipelines | worker (Sonnet) | Pipeline register/run in the runner, the `builtin.data.pipeline-source`/`-step` executors, SDK `runPipeline`, SDK 0.2.0 | Partial (it ran no fluxiq typecheck, by brief) | I fixed its 5 type errors; tests pass |
| acceptance | worker (Sonnet) | The 7 scenarios through the SDK over HTTP on the real runner | Done; no product defect found | Read the assertions and re-ran the groups |

No escalations. At most two workers ran at once, and only one of them held the fluxiq typecheck slot.

### What was built

1. **Runner** (`service/fluxnode/`).
   - **Flows.** One owner project. One Flow per name + spec hash, recording its name, hash, `nodes/...` path
     and spec in its metadata, which also rebuilds the registry after a restart.
   - **Goal and inputs.** The filled goal becomes the Flow's instruction. The caller options gain `inputs`.
     `flow-run/input-bound-steps.ts` is the static, model-free rebinding of fixed values equal to an input,
     applied in `draft-save.ts`. A replay runs with this run's inputs.
   - **Caller options:**
     - the task key is name + hash;
     - `explore` uses its own key;
     - the model, the budget and the judge are passed on;
     - the check is bridged to `check_needed`;
     - the person sink raises `person_needed`;
     - the scope gives both the grants and the sites.
   - **Results.** Outputs come from stored rows, are validated with `validateJsonValue` and carry lineage.
     Results and events parse with the contracts' parsers.
   - **Run registry.** In memory: idempotency, stop, list cursor, resume handle, export with pin.
2. **HTTP API** (`server/fluxnode-api/`).
   - **Endpoints.** All 8 endpoints, with events sent as server-sent events (`Last-Event-ID` / `?after=`).
     Error bodies follow the contracts.
   - **Open-mode guards.** The guards refuse:
     - a remote address that is not loopback;
     - a `Host` that is not a loopback name;
     - any `Origin`;
     - a cross-site `Sec-Fetch-Site`;
     - a call with no `FluxIQ-Client` header;
     - a POST that is not JSON.

     No `Access-Control-*` header is ever sent, and OPTIONS answers 405.
   - **Caller.** Every call acts as owner/FluxNodeRunner.
   - **Mounting.** `startHeadlessServer({ fluxNodes })`, and `runDev(..., { createFluxNodes })`.
3. **Engine fixes** (`answer-first/`).
   - **Judge off with no check** now ends `achieved`. A new optional attempt marker `checkingOff: true` lets
     `checkAutomationStudioTaskAttemptResult` accept achieved+unverified only with it.
   - **`budgetUsd: 0`** replays the saved Flow at no model cost. It ends `budget_out` with no model call when
     the replay cannot confirm or no Flow exists.
   - **Scope gate.** `caller/replay-scope.ts` checks the plan before a replay runs. Off-site resolved steps
     are refused, and a start location off the site list is refused as invalid input.
   - **Carry on and Run again** restore the kept serialisable options through `caller/held.ts` and
     `caller/kept.ts`. Run again checks against the kept key.
   - **Repair rounds** use this run's inputs, through `flow-run/input-valued-steps.ts` called from
     `rounds.ts`. The worker confirmed the test fails with the fix switched off.
4. **Pipelines.**
   - **In the runner.** `service/fluxnode/pipeline/` registers and runs pipelines. The `FlowCaller` is bound
     to `runFluxNode`, so a mapped call is a full FluxNode run that replays at $0 once learned.
   - **Executors.** They are registered in `packages/fluxiq/src/components/automation/data/index.ts` and
     live in `components/automation/data/pipeline/`.
   - **SDK.** `FluxIQ.runPipeline`, and `local` now means `http://127.0.0.1:3000`, where `fluxiq dev` serves.

## Integration changes I made

- The contracts change and the `FluxNodeService` port, before dispatch. I also added `fluxnode` to the
  `service/index.ts` barrel.
- `server/fluxnode-api/tests/fake-fluxnode-service.ts`: the fake's `register` answer gains `name`, which the
  contract requires. This was the only typecheck error after round 1.
- `server/cli/run-command.ts`: `fluxiq dev` passes
  `createFluxNodes: (fluxiq) => createFluxNodeService({ service: fluxiq.programs.automationStudio, domainId: fluxiq.activeDomainId })`.
- `components/automation/data/pipeline/step-node.ts`: removed a port `description`, which `AutomationNodePort`
  does not have, and kept the text as a comment.
- `service/fluxnode/pipeline/tests/pipeline-runs.test.ts`: specs are parsed with `fluxNodeSpecSchema.parse`
  before registering, as the other runner tests do, and an optional `stepId` is read safely.

## Commands run and observed results

These are my own runs after all integration, unless a line says otherwise.

- **Vitest over every changed fluxiq directory** (from packages/fluxiq): `node ../../scripts/vitest-groups.mjs --groups=parallel,real-sql src/server src/framework/automation-service/service/fluxnode src/framework/automation-service/service/answer-first src/framework/automation-service/service/pipelines src/components/automation src/runtime/answer-first/attempt-purse`
  - The run printed `[vitest-groups] all groups passed: parallel, real-sql` and exited 0.
  - The real-sql group printed `Test Files 58 passed (58)` and `Tests 428 passed (428)`. The parallel group's totals were cut off by my output filter, but its pass is in the line above.
- **Contracts tests** (packages/contracts): `npx vitest run src/fluxnode src/task-attempts` printed `Test Files 34 passed (34)` and `Tests 219 passed (219)`.
- **Contracts typecheck:** `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` exited 0.
- **SDK** (packages/sdk):
  - `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` exited 0;
  - `pnpm test` printed `Test Files 18 passed (18)` and `Tests 88 passed | 2 skipped (90)`. The skipped tests are POSIX-only.
- **fluxiq typecheck** (packages/fluxiq): `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental -p tsconfig.json` printed `TSC_EXIT=0`.
  - It was the final run, after the acceptance worker's tsconfig and vitest config edits.
  - Earlier runs: after round 1 it failed with 1 error (the fake's `name`), and after round 2 with 5 errors (pipelines). I fixed both; see above.
- **Structure audit** (worktree root): `node scripts/structure-audit.mjs` printed `structure-audit: passed (537 warning(s), 1095 baselined).`
- **Acceptance scenarios**, in `server/fluxnode-api/tests/sdk-acceptance.test.ts`, are part of the `src/server` run above, with 9 tests:
  1. explore, typed outputs and lineage;
  2. replay with new inputs at 0 calls;
  3. a failing check loops, then is confirmed by the check;
  4. budget 0:
     - 4a: replay achieved at 0 calls;
     - 4b: no Flow gives budget_out at 0 calls with a resume handle;
  5. out of scope:
     - an act class the scope does not grant is refused and the run is still achieved;
     - an off-list site is refused and the run is still achieved;
  6. judge off gives achieved/unverified;
  7. a pipeline over records, with the second mapped call replayed at 0 calls.

Free memory ran from 0.5 to 3.7 GB during the work, so no typecheck overlapped another.

## Standing rule check (user, 2026-11-10: fix root causes, never cap symptoms)

I reviewed every fix against it:
- No wait or timeout was lowered.
- No retry, round, call or budget cap was added.
- No repeat was suppressed, and no error is hidden.
- No special case serves one task or input.

The engine fixes each trace a cause:
- the replay skipped at a $0 ceiling;
- the run-again key recomputed from words;
- input bindings resolved against no inputs.

The 10-minute `person_needed` wait is the contracts' `waitUntil` default for a program that does not
answer. It is not a fix for anything. One pipeline test uses a $0.0001 budget on purpose, to exercise the
`budget_out` ending.

## Not verified

- **No live model, browser, Lab run or real host.** The tests use the scripted fake library site.
- **The full suites were not run.** That means `pnpm check`, `pnpm test` and Core's whole vitest run, per
  the narrow-check rule.
- **The acceptance test does not go through `startHeadlessServer`.** It mounts `fluxNodeApiHandler` on its
  own loopback server; `startHeadlessServer({ fluxNodes })` is covered by `headless/tests/fluxnode-mount.test.ts`
  with a fake service. `fluxiq dev` with the real factory was not started.
- **Paths not exercised:**
  - `person_needed` end to end (the fake site has no person-only check);
  - `timeoutMs`;
  - resume to completion and Stop over HTTP;
  - SDK key signing (keys are P3b);
  - restarting a pipeline Flow (`readBack`);
  - webhook and file sinks through the runner;
  - panel presses of Carry on and Run again end to end;
  - off-site navigation by a link during a replay, because an engine step reports no page location.
- **`docs/working/fluxnode-plan/reports/sim-bindings.md`, named in my brief, does not exist.** I worked
  without it.

## Open questions for the lead

1. **Pinned replay is not enforced.** `pin` is recorded and exported, but no engine seam makes a pinned
   FluxNode replay only that Flow and hold its repairs as proposals (N8). It needs a seam: a plan revision
   or a later lane.
2. **The run registry is in memory.** Runs, idempotency keys, resume handles and list cursors are lost on
   restart. Specs and Flows survive through Flow metadata, and pipeline incremental state is in memory too.
3. **`retries` is not passed on.** The caller options have no retries field, so the engine's floor of 3
   applies.
4. **The compiled pipeline graph is stored in the Flow's metadata (`pipelineGraph`), not as nodes.**
   `saveFlow` refuses nodes on a top-level Flow until Flow unification (P6) lands. The two new
   `builtin.data.pipeline-*` nodes are visible in the model's node catalog, and no hide mechanism exists.
5. **When a pipeline's mapped call ends budget_out, stopped or waiting,** the pipeline ends the same way but
   does not keep the earlier steps' records.
6. **A FluxNode run whose engine answer is `setup_needed` ends `stopped` with no attempt.** That answer
   comes from an off-site start or invalid options, and the contracts have no refused ending. For web specs
   the spec parser already refuses an off-scope start at registration, so the path is unreachable there.
   A start-time pre-check returning `invalid_request` would be cleaner.
7. **Decisions to confirm:**
   - `explore` uses its own task key, so it never replaces the Flow that `auto` replays;
   - a Core error during a run ends it `stopped`;
   - inputs are rebound only on exact equality;
   - a panel Carry on of a FluxNode attempt has no `check` (the kept judge mode applies), and its person
     questions go to the panel conversation.
8. **Package and dependency changes:**
   - the SDK's `local` default moved from 4780 to 3000, to match `fluxiq dev`;
   - `@fluxiq/sdk` is 0.2.0;
   - `fluxiq` gains a published `bin` path to the API, so it needs a minor bump at merge (I did not bump it);
   - `packages/fluxiq` gains a devDependency on `@fluxiq/sdk` (`pnpm-lock.yaml` +3 lines);
   - `tsconfig.base.json` and `packages/fluxiq/vitest.config.ts` map `@fluxiq/sdk` to its source for the
     acceptance test.
9. **A side effect for chat attempts:** an attempt whose Flow limit or Lab ceiling is $0 now replays its
   saved Flow before ending `budget_out`.

## Worker reports

`docs/working/fluxnode-plan/reports/fluxnode-runner/`: `runner.md`, `http-api.md`, `engine-fixes.md`,
`pipelines.md` and `acceptance.md`.
