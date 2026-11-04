# Report: the two Core failures in the 2026-11-04 sweep (t867)

## Outcome

Done. Both failures were real product defects, and both are fixed in the product. No test expectation was changed. Nothing was committed.

| Failure | Cause | Fix |
| --- | --- | --- |
| `web-workspaces.test.ts`, EBUSY on `global.sqlite` | `FluxIQ.close()` resolved while the client gateway's constructor-started read of `client-gateway/trusted-clients` still held the database open | The gateway's `close()` now waits for that read |
| `build-routing.test.ts`, `callsBeforeUnseen` 5 instead of 4 | t859's loop detector wrongly steered at bigbox-run6's decision 23, telling the model a fix "tried 1 times" had not worked | `same_fix` now needs an edit to have led to that draft before |

## What changed and why

### Failure 1: EBUSY on `global.sqlite`

**The product leaks, not the test.** The test's close is only gated and still calls the real close, and no mock is involved in the read that held the file. The leak also reproduced in a copy of the test.

**Cause.**
1. `ClientGatewayTrustedClientRegistry`'s constructor starts `load()` and does not wait for it (`client-gateway/service/trusted-clients.ts`).
2. Each run logged one such read, not two. My reading of why: the first instance's load reads no SQLite because the root is still fresh and has no v2 layout yet, while the instance a reload builds finds a v2 root, so its load opens `global.sqlite`.
3. Opening and preparing that connection takes about 50 ms, in SQLite's own thread.
4. `FluxIQ.close()` never waited for that load, because `ClientGatewayService.close()` only closed its commands. In this test everything else finishes faster than that read, so `rmSync` could run while the connection was open.

**Evidence.** I preloaded a script that tracks every `sqlite3.Database` open and close with its SQL, and ran a repeated copy of the test.

| Run | Runs | EBUSY | Connection on the root when `rmSync` ran |
| --- | --- | --- | --- |
| Before the fix | 20 | 10 | All 10 failures, state `open` or `closing`, opened 55-71 ms earlier; one more was still `closing` in a run that got through |
| Before the fix, logging SQL | 6 | 2 | The failing run's held connection was running only `get client-gateway/trusted-clients` |
| After the fix | 40 | 0 | None in any run |

- Each run opened exactly one connection, and its one statement other than setup pragmas was that read. So no other stray operation exists on this test's path.
- Before the fix, a retried `rmSync` succeeded 31-90 ms after the failure, which fits the connection closing moments later. That timing is why it looked like load.
- The brief's other suspects are ruled out: no reload in flight opened a store that nothing closes, and `closeAll` and the gated close behaved correctly.

**Fix.** `ClientGatewayTrustedClientRegistry.settled()` resolves when that load has ended, however it ended. `ClientGatewayService.close()` awaits it, in a `finally`, after closing its commands. A failed load still belongs to `ready()` to report. `FluxIQ.close()` already awaits the gateway, so this holds for every path that closes an instance.

**Tests added**, in `client-gateway/tests/service.test.ts`:
- Close does not finish while a gated first read is pending. This holds on any platform, not only where Windows locks the file.
- Close succeeds after a failed first read, and `ready()` still reports the failure.

The test's cleanup and line ~225 are untouched: no retries, no `maxRetries`, no try/catch.

### Failure 2: `callsBeforeUnseen` 5 instead of 4

**The decision.** In bigbox-run6, decision 23 is `[{ step: 4, drop }, { step: 11, drop }]`, which empties the draft after the completion check refused it. The next decision, 24, then did what that check asked: it navigated to the start.

**The commit.** 3075bcb37 "Catch an agent repeating itself" (t859). The trace gained one row, `[23, tool_call, llm_evidence_loop.loop_steered, same_fix]`, and decision 24 was shown this note:

> This fix has been tried 1 times already, and what it leads to has already stood and did not work.

**How that moves the number.** The rebuilt lines did not change, so only the shown evidence did.

| Decision | With the steer | After the fix |
| --- | --- | --- |
| 24 | 16 entries, grows the high-water mark (no call before it) | 15 entries, no growth |
| 32 | 16 entries, no growth (a call before it, so it counts as unseen) | 16 entries, grows |

That is why `before` stayed 17 and `callsBeforeUnseen` went from 4 to 5. The "after the fix" column is measured: growth at 1-8, 14, 15, 16, 23, 32, 34, 35, 37, with no loop rows and `rebuilt == expected`. The "with the steer" column is the dump from before the fix.

**Why it is a regression and not an honest new number.** `detector.amended` fired on two returns in a row to any drafts, not on one Flow returning.
- Decision 21 went back to `{4, 11}`, a draft an earlier edit had produced. That is return 1.
- Decision 23 went back to the empty draft. That is return 2, so it fired.
- The empty draft had only ever existed because no step had run yet. No edit had ever led there, which is why the note says `repeats: 1`.
- t859's own report states the rule as a Flow it already stood at "for the second time". So this steer breaks the stated rule.
- It also told the model and the person something untrue ("That fix was already tried and did not work") right after the model did what the check asked. Dropping steps edit by edit is not a fix coming back.

**Fix.** In `detector.ts`, the return-based `same_fix` now also needs `stood.times >= 2`.
- Real toggles still fire, because a draft reached twice by an edit has `times` of 2. The existing ladder tests hold this.
- A Flow known from an earlier context still fires.
- A later edit that brings back a draft it dropped still fires.

The expected number stays 4, as it was. I added a detector test for the drop-then-bring-back shape and updated the `same_fix` row in `docs/architecture/automation-studio/failure-control.md`.

**Files outside the brief's listed paths:** `packages/fluxiq/src/client-gateway/**` is where failure 1's cause sits, and the architecture doc row above.

## Commands run and observed results

From `packages/fluxiq`:

| Command | Observed |
| --- | --- |
| `pnpm.cmd exec vitest run src/framework/automation-service/route-state/tests/build-routing.test.ts --minWorkers 1 --maxWorkers 1 --reporter=dot -t "before and after, for the three recorded builds"`, before the fix | Failed: `callsBeforeUnseen` 5, expected 4 |
| `pnpm.cmd exec vitest run src/framework/automation-service/route-state/tests/build-routing.test.ts src/runtime/llm/decision-context/tests/recorded-windows.test.ts src/runtime/llm/repeat-guard src/runtime/llm/evidence-loop/tests src/client-gateway/tests/service.test.ts src/tests/instance-leak.test.ts --minWorkers 1 --maxWorkers 2 --reporter=dot` | `Test Files 45 passed (45)`, `Tests 513 passed (513)` |
| The same runner on `service.test.ts`, `service-hardening.test.ts`, `durable-reconcile.test.ts`, `commands-host-lease.test.ts` and `detector.test.ts`, after the last test edit | `Test Files 5 passed (5)`, `Tests 60 passed (60)` |

From the worktree root and `apps/web`:

| Command | Observed |
| --- | --- |
| `pnpm.cmd --filter fluxiq build` | Exit 0. **Needed:** the web tests refuse a dist older than Core's source |
| `pnpm.cmd --filter fluxiq check` | Exit 0 |
| `node scripts/structure-audit.mjs` | `structure-audit: passed (491 warning(s), 1097 baselined).` |
| `pnpm.cmd exec vitest run src/lib/workspaces/tests/web-workspaces.test.ts --minWorkers 1 --maxWorkers 1 --reporter=dot`, 12 times in a row | 12 of 12: exit 0, `Tests 16 passed (16)`, no EBUSY |
| Tracked repeat copy of the failing test (temporary file, since removed) | Before the fix 10 of 20 failed, and 2 of 6 in the SQL-logging run. After the fix 40 of 40 passed, nothing held at `rmSync` |

The temporary test files and the preload script are gone from the worktree. The preload stayed in the scratchpad.

## Not verified

- **No run on pre-t859 source.** `git archive` is refused for workers by a hook, so I did not build a copy of the old tree. The commit is named because `core.loop_check` and `detector.ts` exist only from 3075bcb37 (`git log` on `detector.ts` shows that one commit), and removing this one steer restores the expected 4.
- **t859's replay table not re-run.** Its same-fix counts over the 388 saved runs (262 incidents in failed runs) may now be a little lower. Those logs approximate the draft, so the size of the drop is unknown.
- **Why failure 1 surfaced only now.** The race comes from the constructor's read not being awaited, and it reproduced at 33-50% in a repeat of this one test. I did not find which change made it visible in the sweep.
- **Deleting a tenant workspace on Windows.** `deleteNow` closes the instance and then removes its root, so by my reading it could hit the same EBUSY before this fix. I inferred that from the code and did not reproduce it.
- **No full sweep and no live browser run.** Other in-flight database work during a close, such as a write from a request still being handled, was not exercised; this test's path showed none.

## Open questions or contradictions found

- **The `same_fix` steer's wording** can still overstate on real returns. t859's report already lists that as its caveat 2, and I left it alone.
- **Version bump.** `packages/fluxiq/package.json` was not bumped. Other recent Core units carry a "Bump fluxiq" commit, so this one is the lead's to decide.
- **Rebuild after any Core source edit.** This worktree's `packages/fluxiq/dist` now matches the fixes. Editing shipped Core source again makes the web tests refuse until `pnpm --filter fluxiq build` runs. Test files do not trigger this, so the lead's two stale-test edits are unaffected.
