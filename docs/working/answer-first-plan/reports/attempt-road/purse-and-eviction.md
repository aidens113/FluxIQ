# t869 purse and eviction

## Outcome
Done in code; web test and fluxiq typecheck results in "Commands" below.

## What changed and why
**1. A chosen $0.25 holds.**
- Marker `adaptationPolicySettings.maxEstimatedCostUsdPerRunChosen` (key constant in `attempt-purse/cost-limit-chosen-key.ts`).
- Write side: `flow-settings/cost-limit-choice.ts`, called from `flow-settings-requests/update.ts`. The web form resends every field (and retains stored policy keys), so a save marks the limit only when the sent value differs from the stored one, or when the patch names the marker (`true` marks, `false` clears). Otherwise the stored marker is carried, so a patch that rewrites the policy whole does not lose it.
- Read side: `attempt-purse/explicit-limit.ts` answers the limit when marked or not equal to $0.25, else `undefined`. `budget-usd.ts` now treats any `flowSetting` it is given as explicit (header rewritten). `service.ts:1560` passes the reader's answer through the existing dynamic-import style; `wc -l` 4304 before and after, 1 line changed. `attempt/**` untouched. Only caller of the budget is `attempt/ceiling.ts`. Other modes still read `maxEstimatedCostUsdPerRun` as before.
- Plain statement: with $0.25 stored and shown, the form cannot express "exactly $0.25", because the resent value is unchanged. The route can now carry it (`maxEstimatedCostUsdPerRunChosen: true`), but the web form (`apps/web/.../settings/flow-settings-model.ts`, not mine) does not send it yet; it needs a "keep this limit" control or to send the flag when the person edits the field. Until then a person gets exactly $0.25 only by going through another value first (changing the value marks it).
- The Lab test-scoped Flow ceiling (`flows/creation.ts`) is any non-$0.25 value so holds; if the Lab ceiling is exactly $0.25 the env-scoped ceiling in `budget-usd.ts` still holds it.

**2. Waiting attempt counts as busy.**
- `service/answer-first/attempt-in-flight/` (WeakMap by service owner: `counter-of.ts`, `count.ts`, `track.ts`, barrel, tests). `generate.ts` wraps the `service.generateFlowBootstrapAdaptation` call in it for answer-first mode only (small hunk: import, a `counted` helper, call wrapped); `finally` decrements, so a throw is covered.
- `GlobalProgramRuntimeActivity.taskAttemptsInFlight` added with doc comment; `programs/_shared/runtime.ts` reads the count of `automationStudio`. `instanceBusy` includes it. No dependence on databases, tracing or gateway sessions.
- Other `.activity()` readers: only `instance-busy.ts`; the only fake building the type is the new one in `instance-busy.test.ts`; the existing real-instance `toEqual` now includes the field.
- Docs: `docs/architecture/automation-studio/llm-flow-bootstrap.md` (Money paragraph, new Eviction paragraph). `docs/reference/framework-reference.md` is generated from exports and was not hand-edited.
- Not added to the `answer-first/index.ts` barrel (not owned); `runtime.ts` and `generate.ts` import the folder's own barrel.

## Commands
- `pnpm.cmd exec vitest run src/runtime/answer-first/attempt-purse <attempt-in-flight> <flow-bootstrap-requests/tests> <flow-settings-requests> <flow-settings> programs/_shared/tests/runtime-activity.test.ts --minWorkers 1 --maxWorkers 2` -> 12 files, 67 tests passed (run before the two barrel-import fixes below; structure audit forced those).
- `node scripts/structure-audit.mjs` -> "passed (494 warning(s), 1097 baselined)" after the fixes (first run failed on two barrel imports, fixed).
- `wc -l service.ts` -> 4304 before, 4304 after.

## Not verified
- `apps/web` `instance-busy.test.ts`: vitest refuses to start, "stale Core build" (packages/fluxiq/dist predates source). I did not rebuild dist (other lanes edit contracts/ui-components in this tree). Run `pnpm --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/ui-components build` then the test. The Core-side `runtime-activity.test.ts` proves the real runtime wiring (zero databases, zero sessions, no tracing: 1 while waiting, 0 after end and after a throw).
- `apps/web` typecheck not run (needs the rebuilt dist for the new field).
- The tests were not rerun after the two barrel-import fixes (pure import path changes; covered by the typecheck result if it passed).
- A real attempt waiting on a person end to end was not exercised.

## Update after the final runs
- `generate.ts` needed a local `actor` const (closure lost the narrowing); fixed. `pnpm --filter fluxiq check` then reported errors only in other lanes' files (`attempt-store/locator.ts`, `outcome-*`, `api/handlers/task-attempts.ts`, `task-attempt-store.ts`); none in files I own or touched.
- Final vitest run: 11 of 12 files pass. `runtime-activity.test.ts` now fails in `createGlobalProgramRuntime` because another lane's in-progress `task-attempts.ts` registers an endpoint with the wrong IAM access level ("list-conversation-task-attempts declares access level Read; ... is List"). It passed (1 test) before that file appeared. It will pass again once that lane fixes its registration; not mine to touch.
- `wc -l service.ts`: 4304.
