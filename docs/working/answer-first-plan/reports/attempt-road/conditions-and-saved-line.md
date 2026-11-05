# t869: conditions read bare names, the saved line names a dropped act, the toast closes with the card

## Outcome
Done, with one check that cannot go green until Core's `dist` is rebuilt (below). No paid call, no browser, no dist rebuild, nothing committed.

## 1. A heading never satisfies a condition
- **Seam:** a new optional host hook `routeConditionState(state)` (`S/runtime/automation-host/boundary.ts`). Core applies it in `resolveAutomationStudioRouterState` (`SVC/../route-state/router-state.ts`, one line) after the host observes the state. The evaluator is untouched and knows no mark. The model's view (`observeRouteState`, history) keeps the marks.
- **Domain:** `route-state/condition-state.ts` (`webAutomationRouteConditionState`) takes each mark off the controls line through `webRouteControlName`, so the line equals what it was before headings. Wired in `host-runtime.ts` (one line plus import; that file was not on my owned list, it is the only place the hook can be set).
- **Tests:** domain `route-state/tests/condition-state.test.ts` (heading holds the word: not found; control holds it: found; equals, matches and starts-with read the whole bare line; other keys untouched). Core `route-state/tests/router-condition-state.test.ts` (with and without the hook).
- The domain test checks the line with plain string operations, not Core's evaluator, because the evaluator is not a public export.

## 2. The saved line says a landed step is out of the Flow
- Contract: optional `leftOut: string[]` on `ready` and `partly_works` (names, 200 characters each), parsed with a new code `saved_state.invalid_left_out`; an empty list is dropped; refused on `notes_only` and `needs_you`.
- Core: `task-memory/left-out-steps.ts` (new, in the barrel) names each step the draft marks `landed` (`automationStudioFlowDraftStepLandedOut`) by its words, or "Step N". Filled in `attempt-store/outcome-of-record.ts`.
- UI: restated in `ports/results.ts`; `answer/words/left-out-words.ts` and `saved-words.ts`. Reads: `Saved today: the steps, except the one that did "Save: Round pine dining table" (it was left out of the Flow). They have not run on their own yet, ...`. Several: "the ones that did "A" and "B" (they were left out of the Flow)"; past three, "and N more".
- Tests: contract (parse, bounds, states), `outcome-of-record.test.ts` (a dropped press is named, a dropped look is not), `left-out-words.test.ts` (4).
- Not covered: the task memory's own saved state (`task-memory/saved-state.ts`, the Tasks screen row) does not carry `leftOut`.

## 3. The closing row comes when the answer is stored
- Cause: `build.ts` emitted the attempt's ending only when the whole build call returned.
- `automation-activity/attempt-ending.ts`: a per-build `AsyncLocalStorage` tracker; `emitAutomationStudioAttemptEnded(answer)` says the ending once and marks it. `build.ts` runs `fn` through the tracker and skips its own ending if the attempt said it. `answered-ending.ts` holds `answeredEnding` (moved out of `build.ts`) and the shared emit.
- `answer-first/attempt/ending.ts`: builds the answer, calls it just before returning, after the record, memory and apply-proven writes.
- Tests: `attempt-ending.test.ts` (6): row before return, working then one closing row, once on a double call, still said by the build if the attempt did not, no cross-build marking, another mode byte for byte. `build-answered.test.ts` unchanged and passing.
- Risk: if `finish` threw after the emit (only the contract's self-contradiction check can), the build would also emit a failed row.

## 4. Docs
- New `docs/architecture/automation-studio/saved-flow-defects.md` (a plain press is not lasting at the run stage, and what follows).
- Extension `docs/architecture/page-evidence.md`: the `extractionBinding` paragraph, and a paragraph that a condition reads the bare names.
- `second-attempt/design.md` "What carries between attempts" already reads "the lead's call, reported to the person, who may overrule it", not the person's rule. Left as is.

## Commands run
- Domain `DOMAIN_TEST_BUILD_LABEL=cond-state node scripts/test-domain.mjs runtime/route-state/ state-routing-run host-runtime` -> tests 108, pass 108, fail 0.
- Domain `npx tsc -p tsconfig.json --noEmit` and `-p tsconfig.test.json --noEmit` -> **2 errors each, both at `host-runtime.ts(323)`: `routeConditionState` does not exist in type `WebAutomationHostRuntime`, and the implicit `any` that follows.** Cause: the domain resolves `fluxiq` types from Core's stale `dist`, which has no new field. Goes away on a dist rebuild; not rebuilt here as told.
- Core vitest, `--minWorkers 1 --maxWorkers 2 --exclude "**/.tmp/**"`: `src/runtime/automation-activity src/ui/activity-status` plus `answer-first/{attempt,attempt-store,task-memory}` -> 100 files, 773 tests passed. `route-state/tests/router-condition-state.test.ts` -> 2 passed.
- Contracts `src/task-attempts` -> 10 files, 96 passed.
- ui-components `src/chat/answer src/chat/ports src/testing/results` -> 8 files, 85 passed.
- `pnpm.cmd --filter fluxiq --filter @fluxiq/contracts --filter @fluxiq/ui-components check` -> all three Done, no errors.
- Core `node scripts/structure-audit.mjs` -> passed (529 warnings, 1097 baselined) after fixing one statement-packing failure in my own test. Extension audit -> passed (244 warnings, 552 baselined).

## Not verified
- No live run, so no toast or chip seen in a browser.
- `routeConditionState` is not exercised through the real host runtime until dist is rebuilt (the type error above).
- The old saved Flows' conditions that matched a heading's words now read false by design.
