# t616 sweep-flakes-deterministic: worker report

Branch `task/t616-sweep-flakes-deterministic` in Core
(`C:/Users/osrs_/FluxStuff/fxwork/t616/!FluxIQ`) and downstream
(`C:/Users/osrs_/FluxStuff/fxwork/t616/!FluxIQWebExtension`). Nothing committed.
Product behaviour is unchanged and production stays on the real clock.

## Outcome

Done for the brief's three items and the coordinator's addition
(`execute.test.ts`, `project-build-brief-ports.test.ts`). `dev` was **not** merged
into the task branches (see Open questions). Every flaky test is named below,
with its loaded failure before the fix and loaded passes after it.

How load was made: N parallel copies of the test command, plus M CPU-bound
`node` busy loops (`scratchpad/t616/burn.mjs`) started once collection was done,
on this 8-core machine. Scripts: `scratchpad/t616/load_ctrl2.sh`, `load_core.sh`,
`load_tr.sh`, `summ.sh`.

## What changed and why

### (1) Core `service/command-execution/tests/controller.test.ts`

- **Failing tests, named.** Under load, the failure was always vitest's 15 s per-test
  timeout. "io: second actual effect is admitted only after first actual
  handling/SQL consumption" failed in 3 of 3 copies (3 copies + 6 burners). It is
  the first test, so it carries the file's cold start. "exact run close retains
  actual gateway lease until held post-COMMIT observer drains" failed in 1 of 2
  copies (2 copies + 7 burners). With 16 burners, all 11 tests timed out in all
  3 copies.
- **What they waited on by wall clock.** Every command was sent with
  `timeoutMs: 1000`, so the durable gateway gave each command a 4 s deadline
  (1 s plus `COMMAND_ANSWER_MARGIN_MS` of 3 s), counted from `execute()`. That
  deadline covered the lease, the ledger SQL, the answer and the observer. The
  Flow's first node also carried `timeoutMs: 1000`, which bounded the runtime
  path with a real timer. If the pipeline ran slower than this under load, the
  outcome became `outcome_unknown`. The two tests that need an answer never to
  come ("timeout fences ..." and the held-observer test) waited out 3 s and 4 s
  of real time.
- **Change (test file only).**
  - The gateway is built with `commandTimeoutMs: NEVER_MS` (2^31-1), and commands no
    longer send `timeoutMs`, so the deadline cannot fire during a test.
  - Each command carries an `AbortSignal`. The fixture's new `answerNeverCame()` aborts
    it, which reaches the same `uncertain(entry)` ending as the deadline, so the run is
    fenced. Unacknowledged commands get this signal at once. The held-observer test
    sends it after the observer arrives.
  - The Flow's node no longer sets `timeoutMs`.
  - `vi.setConfig({ testTimeout: 120_000 })` is now only a hang guard. The header
    explains all of this.
  - Quiet, the file's tests now take 12.4 s in total instead of 35.7 s.

### (2) Downstream `packages/test-runner`: `launch-browser-worker.test.ts`

- **Failing test, named.** In a full loaded run (`tr_full1.tap`), number 1540 is "a
  persistent profile runs the background worker on disk, not the one it ran
  before". It is the only test from 1536 to 1609 that drives real Chromium and has a
  wall-clock budget. Quiet, it takes 1.4 s; in the loaded full run it took 46.9 s.
  With 6 copies + 12 burners, 3 of 6 failed `test timed out after 120000ms`, and the
  other 3 took 106-115 s.
- **The other candidates are not flaky.** The other 78 tests from 1536 to 1609 (23 files,
  including 1541-1547, 1561, 1589 and 1605-1609) passed in 6 of 6 copies with
  6 copies + 12 burners. Reading them confirms it: they use injected clocks and
  sleepers, or mocks that settle in microtasks.
- **Where the time goes, measured per phase** (`phase_probe.mjs`, 6 copies + 12
  burners): launch, worker and evaluate took at most 7 s. Each graceful
  `context.close()` took 50-125 s.
- **A second mode found after the first fix.** I first gave the worker wait no
  timeout. One of six loaded copies (`trafter1/run1`) then never got a Playwright
  `serviceworker` event and hung until the 600 s guard. Because the browser was never
  closed, the process stayed alive after the guard fired, until I killed it at about
  22 min. This matches the observation gap that the Lab already handles: Playwright
  sometimes never reports the extension worker
  (`launch-extension-session.ts`, `perturbations/stop-service-worker.ts`).
- **Change (test file only).**
  - The build is now read from Chrome's own target list over CDP:
    `Target.getTargets`, then `Target.attachToTarget` (flatten false), then
    `Runtime.evaluate` and a detach. The test reads again until a listed worker
    answers a non-undefined build. It no longer uses a Playwright worker handle.
  - The probe worker keeps itself alive by calling `chrome.runtime.getPlatformInfo`
    every 20 s.
  - The test timeout is a 600 s hang guard (`HANG_GUARD_MS`). When the guard aborts
    `t.signal`, the browser is closed, so a hung run cannot hold up the suite.
  - Quiet runs take 1.4-3.6 s.

### (3) Core supervisor clock option, replacing the stack-frame hook

- **Supervisor (`project-agents/supervisor/supervisor-loop.ts`).**
  - New exported type `AutomationStudioProjectSupervisorClock`
    (`{ setTimeout(fire, ms): unknown; clearTimeout(handle): void }`).
  - New `AUTOMATION_STUDIO_PROJECT_SUPERVISOR_REAL_CLOCK`, which reads the global
    timers at each call.
  - New optional input `clock`. `startClock` sets and clears its two timers through
    this clock; the default is the real clock. The header is updated.
  - I first put this in a new `clock.ts`. That made `supervisor/` 26 files, over the
    25-file limit (structure-audit FAIL), so I moved it into `supervisor-loop.ts`
    (now 312 lines). The barrel `index.ts` is byte-identical to HEAD.
- **The line in `service/project-build/run.ts` that passes it:**
  `clock: AUTOMATION_STUDIO_PROJECT_SUPERVISOR_REAL_CLOCK` in the
  `runAutomationStudioProjectSupervisorLoop({...})` call. The name is added to the
  existing `project-agents/index.ts` import, and there is one comment line.
- **Test (`project-build-time-limit.test.ts`).**
  - A `vi.hoisted` held clock is installed by mocking that one export of
    `../../../project-agents/index.ts`. Only the build's pass-through therefore
    reaches it; the supervisor's own default stays real.
  - The `setTimeout` spy and `new Error().stack` sniffing are gone.
  - Assertions are unchanged: `held()` equals `[6000, 8000]`.
  - Its 60 s timeout became 300 s, because loaded runs reached 61 s (below).
- This item was a seam refactor, not a flake. The t615 stack-sniff version did not fail
  in my loaded runs, so there is no "failing before" for it. The after-runs are below.

### Coordinator addition A: Core `conversations/commands/tests/execute.test.ts`

- **Failing tests, named.** Every failure was the 15 s per-test timeout.
  - 6 copies + 16 burners (`cmdbefore2`): 11 to 14 of 38 tests failed per copy,
    including all of "in candidate authoring mode": `flow.createHere` / `flow.explore`
    "saves a draft reference ...", "a failed candidate build reports saved progress
    ...", and "flow.createHere approves and applies ...".
  - The project-build and commands directories, 3 copies at once + 10 burners
    (`bpbefore4`): 4 to 6 per copy.
- **Wall-clock waits.** None in the tests or the command path; I grepped for timers.
  Each test runs a real thread through an `AutomationStudioProjectDatabasePool` with
  `idleCloseMs` 0, so the project database is opened and closed on every operation.
  That takes 0.5-1 s quiet and 15-23 s loaded.
- **A dead end.** Keeping the pool open (`idleCloseMs`) breaks the tests that call
  `openConversations()` three times: the earlier pools are never closed, giving
  EBUSY on cleanup. I reverted it.
- **Change.** `vi.setConfig({ testTimeout: 120_000 })` as a hang guard, with a header
  paragraph. I did not touch `build.ts`, `create-here.ts` or
  `provider-unavailable-ending.test.ts`.

### Coordinator addition B: Core `service/project-build/tests/project-build-brief-ports.test.ts`

- **Failing tests, named.** "a dependent builder's entry > marks the acts its start
  hook put back undone ..." and "... runs the predecessor's passing proposal
  ...". Both timed out at the 60 s per-test timeout, in every copy of `bpbefore4` and
  `bpprobe1`, at 60-64 s (about 2 s quiet). Some runs also showed EBUSY or ENOTEMPTY
  on `rm(dataDir)` in afterEach.
- **What the cleanup errors were.** A temporary probe that retried the cleanup and
  logged when it succeeded (`scratchpad/t616/probe_rm.log`, since removed from the
  file) found 5 such cases, each released 1.1-3.7 s later. They were the timed-out
  build still writing into the directory being removed: a consequence of the timeout,
  not a separate cause.
- **Wall-clock waits.** None reachable in these tests besides the watchdog. The build's
  own limits are 540 s per builder loop and 1800 s per project build.
- **Change.** `testTimeout` 60 s → 300 s, as a hang guard, with a header paragraph.

## Commands run and observed results

The scratch logs are in
`C:/Users/osrs_/AppData/Local/Temp/claude/c--Users-osrs--FluxStuff--FluxIQWebExtension/ce93e033-0087-42fc-bf77-9757937d964a/scratchpad/t616/`.

**Before (loaded failing reproductions):**

- `load_ctrl2.sh 3 6 150 before4` (controller): 3 of 3 copies failed "io: second
  actual effect ..." with `Test timed out in 15000ms`.
- `before3` (2 copies + 7 burners): 1 of 2 copies failed "exact run close retains ...".
- `before2` (16 burners): 11 of 11 timed out in all 3 copies.
- `load_tr.sh 6 12 150 trbefore1 .../launch-browser-worker.test.js`: 3 of 6 copies
  failed `test timed out after 120000ms`.
- `load_core.sh 6 16 400 cmdbefore2` (execute + brief-ports): execute failed 11 to 14
  tests per copy, all on the 15 s timeout. Brief-ports could not collect under that
  load (`[vitest-worker]: Timeout calling "fetch"`, a vitest RPC timeout).
- `load_core.sh 3 10 400 bpbefore4` (project-build + commands directories): failed on
  brief-ports, both dependent-entry tests, at the 60 s timeout. Execute failed 4 to 6
  per copy at 15 s. The time-limit test "keeps an assembled candidate ..." failed in
  2 of 3 copies at 60.3-61.2 s.

**After (loaded passing runs):**

- Controller: `load_ctrl2.sh 5 6 150 after1`. 5 of 5 copies: 11 of 11 passed. The
  slowest test took 27.6 s, past the old 15 s limit.
- Browser worker, final version: `load_tr.sh 6 12 150 trafter2`. 6 of 6 passed, at
  101-145 s (4 of them past the old 120 s budget). The earlier no-timeout version
  (`trafter1`) was 5 passed and 1 hung; that hang led to the CDP rewrite.
- Execute, brief-ports and time-limit: `load_core.sh 3 10 400 coreafter2` and
  `coreafter3` give 6 loaded runs in total. All three owned files passed in 6 of 6.
  The slowest owned test per copy took 75-88 s.
  - In the same runs, other (not owned) files still failed: `project-build-facade`,
    `project-build-reset`, `project-build-trial-reset` and `extension-chat`. They
    show the same 60 s timeout, with the same EBUSY/ENOTEMPTY cleanup cascade.

**Narrow sets, quiet:** `npx vitest run src/programs/automation-studio/runtime/service/command-execution src/programs/automation-studio/runtime/project-agents src/programs/automation-studio/runtime/service/project-build src/programs/automation-studio/runtime/conversations/commands/tests/execute.test.ts`
gave `Test Files 54 passed (54)`, `Tests 396 passed (396)`. This was after the clock
move.

**Core build and checks:**

- `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq) exited 0 with no output, after
  the clock move.
- Core `node scripts/structure-audit.mjs`: `structure-audit: passed (362 warning(s), 1156 baselined)`.
  The `clock.ts` version had failed `[directory-files] ... supervisor/: 26 source files`.
- Core libraries rebuilt with
  `pnpm --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket build`:
  Done.

**Downstream checks:**

- `pnpm --filter @fluxiq-web-extension/test-runner check` exited 0.
- `pnpm --filter @fluxiq-web-extension/test-runner build` rebuilt `dist`.
- Downstream test-runner package tests, `node --test --test-reporter=tap "dist/**/*.test.js"`,
  in `tr_full2.tap`: `# tests 2301`, `# pass 2296`, `# fail 0`, `# skipped 5`.
- Downstream `node scripts/structure-audit.mjs`: `structure-audit: passed (194 warning(s), 639 baselined)`.

## Not verified

- No live run (per the brief) and no full `pnpm check` / `pnpm test` sweep.
- That the CDP-read browser test would still catch the original Chromium regression.
  I did not disable `forgetCachedServiceWorkers` to watch it fail; the assertion is
  unchanged, so a stale worker would still read "first".
- The rare Playwright observation gap, after the fix: 24 instrumented loaded probe runs
  (`phase_probe2` / `phase_probe3`) never reproduced it. The CDP read avoids that
  channel, but the exact hang point in `trafter1/run1` was not captured.
- The browser worker's five loaded runs ran the final version once (6 of 6). The other
  five-run evidence is from the earlier version.
- I did not prove that the exact numbering of the original sweep failure matches 1540.
  Numbering depends on file order; 1540 is the only real-browser test in the range,
  and the only one that reproduces.

## Open questions or contradictions found

- **`dev` not merged.** The coordinator asked me to merge `dev` before finishing. My
  worker rules forbid history-changing git commands, and a hook denies them, so the
  supervisor needs to do it. I checked read-only: Core `dev` (`f78dcba9`, t619)
  changes `service/project-build/run.ts` in other hunks (header, line ~231,
  `toldEnding`). My edits there touch only the `project-agents` import list and the
  supervisor call's `observe`/`clock` lines, so the merge should be textually clean.
  It does not touch my other Core files. Downstream `dev` (`19f1f1b2`) does not touch
  `packages/test-runner`.
- **Same failure mode in files I do not own.** `project-build-facade.test.ts`,
  `project-build-reset.test.ts`, `project-build-trial-reset.test.ts` and
  `conversations/commands/tests/extension-chat.test.ts` fail under the same load. The
  cause is the same: a 60 s (or 15 s) per-test watchdog, plus cleanup EBUSY/ENOTEMPTY
  from the timed-out build still writing. They need the same treatment in a follow-up
  brief.
- **`project-agents/supervisor/tests/supervisor-time-limit.test.ts`** still runs
  supervisor time limits of 300-1200 ms on the real clock. It did not fail in my runs,
  but it is load-sensitive by construction and could take the new `clock` input.
- **Vitest can fail to collect files under heavy load.** Its RPC timeout
  (`[vitest-worker]: Timeout calling "fetch"`) does this, which is infrastructure
  rather than a test.
