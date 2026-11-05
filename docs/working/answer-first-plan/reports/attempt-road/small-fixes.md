# t869 small fixes

## Outcome
Done. Items 1-4 done; item 5 untouched.

## What changed and why
1. Settings form: `FlowSettingsDraft` gains an optional `maxAdaptationCostUsdPerRunEdited` note, set only by `applyFlowSettingsField` (new `settings/draft-field.ts`) when the cost limit field is edited. `buildFlowSettingsSavePayload` then sends `maxEstimatedCostUsdPerRunChosen: true`; other saves do not mark it (a stored marker still rides through). The round-trip check ignores the note.
2. Web panel: new pure `authoring/generation-answer.ts` (`generationAnswerLine`) reads `{answered}` and `{setupNeeded}` and gives Core's chat words (copied, since Core does not export them). The panel shows the line as a status, never as an error. Other modes unchanged.
3. Toast: new `S/ui/activity-status/attempt/` (words, opens, headline). `UnitSituation` marks a unit as an attempt from its "Working on your task" row; the pacer passes that to `activityHeadline`. Headlines: Working on your task / Finished / Reached this task's budget / Stopped / Waiting for you / Before I can start; a cancelled attempt says Stopped, an unexplained error says "Couldn't finish your task". `build.ts` uses the shared words and now ends a budget-out as phase `done`, not `failed`, so it is not an error tone. THIS CHANGES WHAT THE EXTENSION SHOWS (the shared headline) for answer-first attempts only; other builds and runs are unchanged (tested).
4. Lab: `live-launch.mjs` default is `project` (comment and constant); its tests updated, including `admit-live-run` where an unnamed launch is now a rerun of the project run (`unchanged`). `environment.ts` comment corrected. `run-scenario.ts` passes `buildCallLimit` through new `live-llm/answer-first-call-limit.ts` (`labBuildCallLimitFor`): answer-first gets none unless `--llm-max-calls` is typed. `record.ts` comment on `steps` corrected.

## Commands run and observed
- `vitest run src/ui/activity-status/tests src/runtime/automation-activity/tests` (packages/fluxiq, min 1 max 2) -> 36 files, 316 tests passed.
- `vitest run` (apps/web) cost-limit-chosen, settings, settings-round-trip, authoring/tests -> 7 files, 85 passed (generation-answer test included, run earlier: 7 passed).
- `pnpm.cmd --filter fluxiq check` -> ok (after the final Core edit). `apps/web` `tsc --noEmit` -> no output.
- `node --test scripts/lab/live-guards/tests/*.test.mjs` -> pass 51, fail 0.
- `pnpm.cmd --filter @fluxiq-web-extension/test-runner check` -> ok; `node --test dist/live-llm/tests/answer-first-call-limit.test.js` -> pass 2, fail 0.
- `node scripts/structure-audit.mjs` -> passed in both repos (after fixing three violations I caused).
- Core libs rebuilt twice for the web vitest staleness guard.

## Not verified
No browser/panel render test of the Explore panel's new line (pure function only). Extension chat not exercised live. Web tests ran only the listed files.

## Open questions
- A budget-out is now phase `done` (a tick) in the activity stream; there is no neutral phase.
- Added files outside the named owned paths: `test-runner/src/live-llm/answer-first-call-limit.ts` (+test, index export), `apps/web .../settings/draft-field.ts`, `persistence-check.ts`, `FlowSettingsView.tsx`, `authoring/index.ts`.
