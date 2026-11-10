# P2b acceptance: the real SDK over loopback HTTP on the real runner

Worker: Sonnet 5.5, worktree `fxwork/t886/!FluxIQ`, branch `task/t886-fluxnode-runner`. Nothing committed. P = `packages/fluxiq/src`.

## Outcome

Done. All seven scenarios pass (nine tests). No product defect was found, so no product code was changed.

The path under test: `@fluxiq/sdk` `FluxIQ.connect({ url })` (open mode, an empty `FLUXIQ_CONFIG_DIR`) -> `fetch` over `127.0.0.1` -> the real `fluxNodeApiHandler` (guards on) on a `node:http` server at port 0 -> the real `createFluxNodeService` -> `generateFlowBootstrapAdaptation` on the real `AutomationStudioService` with a scripted model on the lending library. No live model, no browser, no money.

## Scenario results (observed, `P/server/fluxnode-api/tests/sdk-acceptance.test.ts`)

| # | Test | Observed through the SDK |
| --- | --- | --- |
| 1 | run 1 explores, typed outputs, lineage | `status achieved`, `path explored`, `flowPath nodes/library/find-loans`, `verdict {confirmed, by check}`; `outputs.loans[0].title` typed by zod, equals `{loans:[{title:"Atlas of Rivers",due:"2030-01-01"}]}`; lineage `/loans/0` source `read`; the SDK `check` ran once with the outputs and `{title:"Atlas"}`; `cost.calls` > 0 and equal to the script's model-request count; 0 judge calls |
| 2 | run 2, new inputs, replay | `achieved`, `path replayed`, same `flowId` and `specHash`, `cost {calls:0,tokens:0,usd:0}`, 0 model requests, outputs `Clockmaking`, engine's "Find loans" ran with exactly `["Clock"]`, lineage `/loans/0` with run 2's id |
| 3 | failing check goes back | SDK check returned the reason first; the next decision's evidence contained it; second check passed; `achieved`, `verdict {confirmed, by check}`, `path explored`, 4 decisions, `cost.calls` = requests asked, 0 judge calls |
| 4a | `budgetUsd 0`, learned Flow | `achieved`, `path replayed`, `by check`, `cost {calls:0,usd:0}`, 0 model requests, outputs for the new input `Birds` |
| 4b | `budgetUsd 0`, no Flow | `budget_out`, `cost.calls 0`, `resumeHandle` is a string, 0 model requests, no library read or act (only the free initial look at the page) |
| 5a | act class not granted | script runs `renew_card` declaring `modify_existing` under `scope.acts: []`; the model's next decision's evidence contains "an act this task may not do (modify_existing)"; `library.renewals` is `{}`; run still `achieved` with the Birds loan, 3 decisions |
| 5b | address off the sites | `scope.sites ["library.example"]`, a call naming `https://elsewhere.example/loans`; evidence contains "elsewhere.example is outside the sites this task may use (library.example)"; no library call mentions that host; run `achieved`, 3 decisions |
| 6 | judge off, no check | node with no outputs type, `options.judge "off"`: `achieved`, `verdict {label unverified}` with no `by`, `path explored`, outputs `{records:[...]}`, 0 judge calls |
| 7 | pipeline | `pipeline("library.loan-report").fromInput("titles").map(finder, ...).outputs(zod).build()`; `runPipeline<Row>` returned `achieved` with two typed records (`found.loans[0].title` is typed), `verdict {confirmed, by type}`, lineage `/0/found/loans/0` and `/1/found/loans/0` (source `read`); 2 model decisions in all (record 2 replayed record 1's learned Flow); a second `runPipeline` was `achieved`, `path replayed`, `cost.calls 0`, 0 requests |

## What changed and why

- **New** `P/server/fluxnode-api/tests/sdk-acceptance.test.ts` (9 tests) and `sdk-lane.ts` (loopback server over `fluxNodeApiHandler`, SDK client connect, cleanup closes the server before the service).
- **Edited** `P/framework/automation-service/service/fluxnode/tests/library-lane.ts` (test support, owned path): `arm({script, judge})` returns `{asked, decisions, judgeCalls}` for callers that start runs themselves (the SDK); the "past the script, stop the program's run" step now uses `stopRunning`, which stops the named run, or every running run when none is known (the SDK starts runs the lane does not see). `run()` behaves as before.
- **Resolution of `@fluxiq/sdk`** (outside the brief's named paths, needed because the SDK's `dist` is untracked and nothing in `vitest run`/`tsc` builds it, the same reason contracts resolve to source):
  - `packages/fluxiq/vitest.config.ts`: alias `@fluxiq/sdk` to `../sdk/src/index.ts`.
  - `tsconfig.base.json`: path `"@fluxiq/sdk": ["packages/sdk/src/index.ts"]`.
  - `packages/fluxiq/package.json`: devDependency `"@fluxiq/sdk": "workspace:*"`.
  - `pnpm install --offline` from the worktree root: lockfile change is exactly +3 lines in `pnpm-lock.yaml` (`'@fluxiq/sdk'` specifier `workspace:*`, version `link:../sdk` under `packages/fluxiq` devDependencies). No other change.
  - No SDK build was needed.

## Fixes to product code

None. No scenario exposed a defect.

Observations that are not defects:
- 3: a run keeps everything it read, so the second check sees the first read's loan plus the new one (`Atlas of Rivers,Clockmaking`). My first draft of the test wrongly assumed only the second read; the test now asserts the accumulation.
- 4b: an exploration's initial `library.look` of the page happens even at budget 0 (it is a read with no model call).
- 6: a declared outputs type with the judge off is `confirmed by type`, not `unverified`; `unverified` needs no declared type and no check, as the runner's own test has it.

## Commands run and observed results

Free memory before heavy commands: 1.9 to 3.6 GB.

- `pnpm install --offline` (root): `Done in 46.7s`; lockfile +3 lines as above.
- `node ../../scripts/vitest-groups.mjs --groups=parallel,real-sql src/server src/framework/automation-service/service/fluxnode` (packages/fluxiq): parallel `Test Files 12 passed (12)`, `Tests 98 passed (98)`; real-sql `Test Files 5 passed (5)`, `Tests 29 passed (29)`; `[vitest-groups] all groups passed: parallel, real-sql`.
- After the final test refactor (statement packing), `--groups=real-sql src/server/fluxnode-api src/framework/automation-service/service/fluxnode`: `Test Files 4 passed (4)`, `Tests 24 passed (24)`, `all groups passed: real-sql`. The new file alone, run twice before: `Tests 9 passed (9)`.
- packages/sdk: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` -> `SDK_TSC=0`. `pnpm test` -> `Test Files 18 passed (18)`, `Tests 88 passed | 2 skipped (90)`.
- packages/fluxiq: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental -p tsconfig.json` -> no output, `TSC_EXIT=0` (run once, at the end).
- Worktree root `node scripts/structure-audit.mjs`: first run `FAIL [statement-packing] ... sdk-acceptance.test.ts: 3 lines hold more than one statement`; fixed (a `noting` helper, a multi-line check). Final: `structure-audit: passed (537 warning(s), 1095 baselined).`

## Not verified

- No live model, no real browser, no `startHeadlessServer` mount (the handler is on its own `node:http` server; the mount has its own tests in `headless/tests/fluxnode-mount.test.ts`).
- SDK key signing (open mode only), `onPersonNeeded`, resume to completion, `fluxiq.stream` events and Stop over HTTP were not exercised here.
- Full `pnpm check`, `pnpm test`, Core-wide vitest were not run (the daily allowance).
- The fluxiq `tsc` result was read after the final test edit; the sdk tsc and tests ran before the last test-only refactor, which touches no SDK file.

## Open questions

- The `tsconfig.base.json` path and vitest alias for `@fluxiq/sdk` are shared config edits. If the supervisor prefers building the SDK `dist` instead, remove both and keep the devDependency; the test imports only `@fluxiq/sdk`.
