# t644 load-sensitive-tests: worker report

Branch `task/t644-load-sensitive-tests` in Core (`C:/Users/osrs_/FluxStuff/fxwork/t644/!FluxIQ`).
Nothing is committed. Only test files and test support changed. No production file changed, and production still
runs on the real clock. No production seam was needed: the supervisor's `clock` input (t616) and the service's own
`buildCancellation` already existed.

## Outcome

Done.

- **Before:** I reproduced the failures under load: 3 copies and 8 CPU burners.
  - trial-reset failed in 3 of 3 copies, and facade failed in 1 of 3. Each failed on the 60 s watchdog, followed by
    EBUSY or ENOTEMPTY when the directory was removed.
  - extension-chat and project-build-reset did not fail in my before round, but reached 52 s and 44 s against the
    60 s watchdog. t616's rounds show both of them failing.
- **After:** under the same load, all 3 copies passed all 36 tests.

## What changed and why

**What waits on the wall clock.** I found this with a temporary probe that wrapped the global `setTimeout` and
tallied every timer of 20 ms or more by call site. The probe has been removed.

- **The reset's settled read: a real 1 s sleep.** `flow-bootstrap/site-reset/start-check.ts` `pause`, used with
  `AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS`, which `service/project-build/brief-ports.ts` passes. It ran 12 times in
  trial-reset, which is 12 of its 16 s quiet, and 11 times in project-build-reset. These are the only real waits on
  the path.
- **Bounds that were never reached:**
  - Each provider call's deadline: 20 s, set at `llm/provider-retry/call.ts:198`. The mocks answer in a microtask.
  - Native node timeout: 30 s. The stubs are synchronous.
  - Judge deadline: 120 s, in `result-verification/deadline.ts`.
  - The supervisor's own limit: 1500 s and 1800 s.
  - The chat interpreter's attempt deadline: 15 s. The scripted model answers at once.
  - Database idle-close timers: 1 s. Nothing awaits them.
- **The watchdogs.**
  - The 60 s per-test timeout.
  - In extension-chat, explicit 60 s and 90 s timeouts on each case, the default 15 s on one case, and vitest's 15 s
    hook timeout. That hook timeout covered an afterEach that waits for the chat's command work.
- **Why cleanup failed.** On the timeout, cleanup closed the service and removed the directory while the build was
  still writing into it. That caused the EBUSY and ENOTEMPTY errors.

**Changes.**

- **New `service/project-build/tests/settled-builds.ts`**, exporting `automationStudioTestSettledBuilds(service, dataDir)`.
  - `track(projectId, flowId, build)` records each build as it starts.
  - `cleanup()` does four things in order:
    1. It calls `service.buildCancellation.cancel(...)` for every build it tracked; this does nothing to a build that
       has already ended.
    2. It waits for every tracked build to settle.
    3. It closes the service.
    4. It then removes the directory.
- **`project-build-facade.test.ts`:**
  - `testTimeout` and `hookTimeout` are set to 300 s, as a hang guard only.
  - The harness's `build` is tracked, and its cleanup uses the helper.
  - A header paragraph explains the change.
- **`project-build-reset.test.ts` and `project-build-trial-reset.test.ts`:**
  - The same hang guard and settled cleanup as facade.
  - `vi.mock("../../../flow-bootstrap/site-reset/index.ts", ...)` sets `AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS: 0`.
    Both reads still happen, back to back. The stub sites never change on their own, so nothing these tests assert
    depends on time passing between the reads. The mock edits nothing under `flow-bootstrap/`.
  - Headers updated.
  - Quiet times: trial-reset went from 16.2 s to 4.9 s, and reset from 25.9 s to 14.0 s.
- **`conversations/commands/tests/extension-chat.test.ts`:**
  - `vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 })`.
  - The 11 per-case `60_000` and `90_000` timeouts were removed, so every case and the cleanup hook take the hang guard.
  - The cleanup already waited for `automationStudioConversationCommandWork.idle()` before closing and removing. It
    now has room to finish that wait.
  - A header paragraph was added. It names the one bound that remains: the judge's single database read, inside the
    provider's 20 s deadline. That read happens inside the scripted provider.
- **`project-agents/supervisor/tests/supervisor-script.ts`:** `supervise` takes an optional `clock`, which it passes to
  `runAutomationStudioProjectSupervisorLoop`.
- **`project-agents/supervisor/tests/supervisor-time-limit.test.ts`.** The limit now runs on `heldClock()`, a clock
  the test holds: a timer fires only when the test calls `reach(ms)`.
  - **How the clock moves.** `hanging(built, hang, whileWorking)` calls back once a hanging dispatch is waiting on its
    signal. Each case moves the clock at that point.
  - **Assertions on that clock replace the wall-clock assertions** (`tookMs` bounds, and a real 400 ms sleep):
    - Case 1: `["600 fired", "1200 cleared"]`.
    - Case 2: `["500 fired", "900 fired"]`, and the reset had not been aborted when it started.
    - Case 3: `["200 fired", "400 cleared"]`.
    - Case 4: `["200 cleared", "300 cleared"]`. Moving the clock to 300 afterwards does not abort the builder.
  - Every other assertion is unchanged.

## Commands run and observed results

The load script is `scratchpad/t644/load.sh <copies> <burners> <burnSeconds> <tag> <files>`, using `burn.mjs` from
t616. Logs are in `C:/Users/osrs_/AppData/Local/Temp/claude/c--Users-osrs--FluxStuff--FluxIQWebExtension/ce93e033-0087-42fc-bf77-9757937d964a/scratchpad/t644/`.

**Before any load.** I checked `tasklist` and the node.exe process list: no node processes.

**Before, loaded** (`before1`: 3 copies, 8 burners, 360 s; the five files at HEAD):

| Copy | Result | Failures |
| --- | --- | --- |
| run1 | `Tests 1 failed \| 35 passed` | trial-reset `Test timed out in 60000ms`, then `ENOTEMPTY ... rmdir ...fluxiq-project-build-trial-reset-...\runtime\indexes` |
| run2 | `Tests 2 failed \| 34 passed` | trial-reset timeout, then `EBUSY ... unlink ...\runtime\sqlite\global.sqlite`; facade "keeps the proposal of a subflow an amendment left as it was..." `Test timed out in 60000ms` |
| run3 | `Tests 1 failed \| 35 passed` | trial-reset timeout, then EBUSY |

The slowest test per file, in ms:

| File | run1 | run2 | run3 |
| --- | --- | --- | --- |
| trial-reset | 60371 | 60474 | 60218 |
| facade | 48811 | 60581 | 50172 |
| extension-chat | 52367 | 52524 | 37300 |
| reset | 43635 | 41289 | 36016 |
| supervisor-time-limit | about 920 | about 920 | about 920 |

**Waiting for other workers.** After the edits, t641 (vitest) and t643 (`pnpm check`) were validating. I re-checked
every 2 minutes: checks 1 to 8 found processes, and check 9 found 0. Then I ran:

**After, loaded** (`after1`: 3 copies, 8 burners, 360 s):

| Copy | Result |
| --- | --- |
| run1 | `Test Files 5 passed (5)`, `Tests 36 passed (36)` |
| run2 | `Test Files 5 passed (5)`, `Tests 36 passed (36)` |
| run3 | `Test Files 5 passed (5)`, `Tests 36 passed (36)` |

No EBUSY, ENOTEMPTY or timeout appeared. The slowest test per file, in ms:

| File | run1 | run2 | run3 |
| --- | --- | --- | --- |
| trial-reset | 56877 | 61292 | 54854 |
| facade | 48289 | 53688 | 47152 |
| extension-chat | 49328 | 48820 | 49070 |
| reset | 38993 | 36479 | 36056 |
| supervisor-time-limit | 393 | not shown | not shown |

- trial-reset's 61292 ms in run2 is past the old 60 s watchdog, and it passed.
- "Not shown" means vitest printed no duration for those tests; it omits durations below its slow threshold.
- The burners exited at 360 s, and the script waits for them. Afterwards no `burn.mjs` process was listed.

**Forced-timeout cleanup probe.** I temporarily set trial-reset's `testTimeout` to 1500 ms, and restored it afterwards.
- With the new cleanup, the only error was `Test timed out in 1500ms`: no EBUSY or ENOTEMPTY.
- The same probe on the HEAD file, quiet, also showed no EBUSY. So this probe does not separate the two versions on a
  quiet machine. The loaded runs are the evidence for the cleanup.

**Mutation checks of `supervisor-time-limit.test.ts`.** Each mutation was made in `supervisor-loop.ts`, then reverted
with `git checkout -- <file>`; `git status` was clean afterwards.

| Mutation | Result |
| --- | --- |
| M1: the clock is never stopped (`stop: () => undefined`) | 3 failed, 1 passed: cases 1, 3 and 4 |
| M2: the ending runs under the work signal | 2 failed. Case 1: `expected true to be false`, because the reset's signal was aborted. Case 2 hung until the 15 s timeout. |
| M3: the work deadline is set at the bound | 4 failed. Case 4: `expected [ '300 cleared', '300 cleared' ] to deeply equal [ '200 cleared', '300 cleared' ]`. Cases 1 to 3 hung until the 15 s timeout. |

**Quiet checks.**

- The five files: `Test Files 5 passed (5)`, `Tests 36 passed (36)`.
- `npx vitest run .../service/project-build .../conversations/commands/tests/extension-chat.test.ts .../project-agents/supervisor`:
  `Test Files 37 passed (37)`, `Tests 230 passed (230)`, duration 133.84 s.
- `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq) exited 0 with no output.
- `node scripts/structure-audit.mjs` (Core): `structure-audit: passed (376 warning(s), 1156 baselined).`
  - The warnings on touched paths are advisory only. `project-build/tests/` has 17 files against an advisory 15; it
    had 16 before.
- `git diff HEAD` shows no added or removed `expect(` line in the service or conversations files.

## Not verified

- **Mutation checks for the four service and chat files.** I did not run any. Their assertions are textually
  unchanged; only the header, config, harness and cleanup lines changed.
- **Whether the settle mock hides anything.** I did not check this by mutation. The stub sites are static, and both
  reads still run.
- **Concurrent load from another worker.** t641's vitest run was listed again right after `after1` finished. It may
  have started during `after1` and added load. That would make the after evidence harsher, not easier, but its
  results could also have been disturbed by my burners. I did not run a second, heavier round (`after2` was skipped)
  because other workers were validating.
- **The provider's 20 s deadline in extension-chat.** It still runs on the real clock, around the judge's database
  read. It was never reached, but it is not test-controlled. Controlling it would need a clock seam in
  `llm/provider-retry/call.ts`.
- No live run and no provider call, as the brief requires.

## Open questions or contradictions found

- **The other four time-limit cases now fail as hangs in some mutations, not as clean assertion failures.** Under M2
  and M3, when the held clock is never moved to a timer it should have fired, the test hangs and the 15 s default
  timeout stops it. The test still fails on the defect, but the message is a timeout.
- **`project-build-time-limit.test.ts` (t616's) has the same cleanup race.** Its cleanup is `close` then `rm`, with
  no wait for the build. I did not own that file and did not touch it. It could use `settled-builds.ts`.
- **Loaded duration is still close to the old limits.** trial-reset at 55-61 s is load on the CPU, not waiting. The
  watchdogs are now 300 s hang guards, so this no longer fails the tests.
