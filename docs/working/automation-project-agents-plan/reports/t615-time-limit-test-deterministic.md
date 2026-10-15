# t615 time-limit-test-deterministic: worker report

## Outcome

Done. The t601 time-limit test no longer depends on how fast the machine is. It passed in 5 of 5 runs under load, where before the change it failed in 3 of 5. Product code is unchanged.

## What changed and why

Only `packages/fluxiq/src/programs/automation-studio/runtime/service/project-build/tests/project-build-time-limit.test.ts` changed. I added no product seam and no new file.

- **Cause.** Under load, the real 6-second work deadline (8 s bound minus the 2 s ending) fired while the builder was still trying its subflow. Run 2 before the fix shows it. The text was expected to read "Left: a part tested once whose last test could not be confirmed" and instead read "Left: a part never tested". The draft test failed at line 133 because the candidate was never tested as a whole.
- **Clock seam.** The service has no clock. The timers are set by `startClock` in `project-agents/supervisor/supervisor-loop.ts`, which I was not allowed to touch, and `run.ts` passes no `timeLimit`. So the test now holds the clock itself, in `holdTheBuildClock()`:
  - It spies `globalThis.setTimeout` and `clearTimeout` and keeps only the timers whose caller stack includes `startClock`. Every other timer still runs on the real clock.
  - A held timer fires only when the test moves the clock forward.
  - `outlivingTheBound()`, the scripted supervisor's decision that never arrives, calls `clock.reachWorkDeadline()` on `setImmediate`. The work deadline is therefore reached exactly while that decision is pending, whatever the load.
  - The 8 s bound timer stays held. This matches the real clock, where the ending finishes inside its 2 s window.
- **New assertion.** Both tests now check `clock.held()` equals `[6_000, 8_000]`, so the mocked bound is shown to reach the build's clock.
- **Unchanged.** The `loop-limits` mock (8 s / 2 s) is the same, so the title still says "8 seconds". All earlier assertions are kept.
- **Comments.** The header and the bound's comment now explain the held clock.

## Commands run and observed results

All vitest commands ran from `packages/fluxiq` in the t615 worktree.

- **Before the fix**, five loaded runs of `npx vitest run src/.../runtime/project-agents src/.../runtime/service/project-build src/.../runtime/flow-bootstrap/subflow-candidate`:
  - run 1: pass, file took 15.7 s
  - run 2: **both tests failed**, file took 27.6 s ("part never tested" mismatch)
  - run 3: **draft test failed**, at line 133
  - run 4: pass, 17.6 s
  - run 5: **draft test failed**, at line 133
  - Result: 3 of 5 runs failed.
- **After the fix, test alone**: 2 passed, in 1.2 s and 1.6 s.
- **Mutation proof.** I temporarily added `delete (outcome as { timedOut?: true }).timedOut;` in `run.ts`, which removes the time-limit ending, and ran the test alone.
  - Both tests failed. The first got code `flow_bootstrap.evidence_cancelled` in place of `post_provider_validation_failed` with `project.build_time_limit`. The second lost `project.build_time_limit` from its codes.
  - I restored `run.ts` from a backup copy; `git diff --stat` then showed only the test file changed.
- **After the fix, same five loaded runs**: all exited 0, each with 56 files and 392 tests passed. The time-limit file took 12.4 s, 8.6 s, 16.5 s, 18.9 s and 36.0 s.
- **Core typecheck**: `npx tsc --noEmit -p tsconfig.json` in `packages/fluxiq` exited 0. It ran alongside loaded run 1.
- **Structure audit**: `node scripts/structure-audit.mjs` first failed `statement-packing` on two lines I had written. After splitting them it printed `structure-audit: passed (362 warning(s), 1156 baselined)`.

## Not verified

- I did not run `pnpm check`, the full test suite, a live run or a provider probe; the brief excluded them.
- I did not separately prove the test fails when the clock never reaches the deadline. If it did not, the abandoned decision would reject after 20 s and the outcome would change. Only the `run.ts` mutation was proved.

## Open questions or contradictions found

- **Slow under load, though deterministic.** The loaded file took up to 36 s (run 5), against `testTimeout: 60_000`. The time now goes into the work before the supervisor's waiting decision, not into the clock. The outcome no longer depends on load, but a much heavier load could still reach the 60 s per-test timeout.
- **How held timers are found.** The test spots the bound's timers by the `startClock` frame in their stack. If `startClock` is renamed, the timers are no longer held and the `clock.held()` assertion fails. A real clock seam in `supervisor-loop.ts`, such as a `clock` option beside `timeLimit`, would be cleaner. It is in `project-agents/**`, which this brief excluded.
