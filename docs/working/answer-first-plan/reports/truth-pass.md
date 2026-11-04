# Truth pass (Extension lane, phase 0)

Task id: **t857** (`task/t857-truth-pass`). Worktrees: `C:/Users/osrs_/FluxStuff/fxwork/t857/!FluxIQ` and `.../!FluxIQWebExtension`. Nothing committed. No provider call, no Lab launch.

## Outcome

Done, including the follow-up round below (the tick, the model-key route through the background, the sweep, headed runs and the screen capture). The original table is kept; where the follow-up changed a row, the follow-up wins.

## Claims, one by one

| Claim (study) | Status | What I found and did |
|---|---|---|
| B 34: failure opens lower case | **Fixed** | `run.ts` now opens the row's text with a capital; the status line keeps the lower case after its colon. |
| B 34: "Core's own record ... so no judge was asked" | **Fixed** | `computed-no.ts` reason no longer says it; `run-ending.ts` objection is dropped for a no FluxIQ reached from its own record. Every "Core" in a computed-fact sentence is said "FluxIQ" (was only at the start). |
| B 34: cut off with "..." | **Fixed** | Ending tries 110 then 260 characters, else falls to the plain ending; a "The check said" reason the screen had to cut is left out whole. A label that would not fit 160 characters is just "Run failed", the whole ending is in the row text. |
| D 20: "The step failed for good (executor.fault.unclassified)" | **Fixed** | Source is `framework/.../run-repair.ts` (not owned). Fixed at the choke point instead: `reason-text.ts` now removes a dotted failure code (3+ parts, not an address) from any reason the chat shows. |
| F 06: "Build stopped. The Flow was not promoted." | **Fixed** | `build.ts`: "Build stopped. Nothing was put into the Flow." |
| "Saved candidate draft. Verification pending", "judged", "trial", "candidate" in command answers | **Fixed** | `build.ts`, `execute.ts`, `run-flow.ts`, `test-ending.ts`, `time-limit-told.ts`, `trial-words.ts`, `folded-reason.ts` reworded. `person-words.ts`: "Core" is FluxIQ, "judge/judged/judging" are check words, "was judged to" is "was found to". |
| Ending note "The judged test run ... was judged not to do what was asked" (seen in the visual spec's chat picture) | **Fixed** | `project-build-ending/record-told.ts`, `readings-told.ts` (not owned, small, tests updated). |
| Guard bans "subflow" | **Fixed** | Lifted. Now bans router, candidate, brief, harness, trial, judge/judged/judging, promoted/promote(s), and the name "Core" (capital C only). Tests updated both ways ("subflow" is clean). |
| E 28: green tick and "Run finished" on "Not confirmed" | **Partly fixed** | Chat: the plain "Run finished" row has no tick (picture E 28 shows the tick is the **on-page card**). Core pacer now headlines such a run "Run finished, result not confirmed" (new `unconfirmed` unit state). The tick mark is chosen by `overlay-view.ts` from `outcome === "done"`: **needs an overlay change** (see Open questions). |
| A 19: red "Didn't work" directly above "Passed" | **Fixed** | New `stream/step/superseded.ts`: a failed test step in a unit whose later result check passed shows neutral (settled), words unchanged. Not for a run, an unconfirmed result, a refusal, or a failure with nothing after it. |
| Onboarding: "take over the page" false in a first task | **Fixed** | `empty-state-model.ts` text is now 3 short sentences: describe, AI works it out showing each step, saved steps repeat without AI, "You can stop it at any time." Test asserts no "take over". |
| Onboarding: "Check this page every morning" implies scheduling | **Fixed** | Example replaced. I did not search Core for a scheduler; I removed the implication only. |
| Model-key button goes to the generic address | **Fixed (differently from the brief)** | `chat-panel.ts` forwarded the whole style already (the type hid `purpose`); the real drop was in the button. The background cannot be changed here, so the button for `purpose: "model-key"` opens `<address>/programs/secret-keys` itself with `window.open`, falling back to the background open when the address is bad. Route is `AI_PROVIDER_SECRET_KEYS_HREF` in the web app. |
| "Show the question" while the question is on screen (A 13) | **Fixed** | `chat-widget.ts`: shown only when no pending question is in the thread on screen. |
| Dead recording review code | **Fixed** | Confirmed by search: only barrels and two tests used `review-model.ts`, `review-view.ts`, `generated-preview.ts`, `test-outcome.ts`. Deleted with their tests (`payload-parsing.test.ts`, `review-model.test.ts`); barrels trimmed. `recording-review.ts` (the live one) untouched. |
| Study "mount-panel passes its own factory" / extension passes no `purpose` | **Stale in part** | The type was the gap, not the call. |
| "take over exists for runs only" | **Confirmed**, kept as is. |
| Chat "Run finished" is plain (no tick) | **Observed**, see E 28 row. |

Not re-checked (no evidence of change, out of this phase): lowercase "Lab only" context line, Firefox claims, PIN path.

## Files changed

Core (`!FluxIQ`): `packages/fluxiq/src/ui/person-facing/internal-terms.ts` (+test), `ui/activity-status/{unit-situation,headline,pacer}.ts`, `steady/test-ending.ts` (+tests), `runtime/activity/text/{person-words,reason-text}.ts`, `runtime/automation-activity/{run,folded-reason}.ts`, `wording/{run-ending,time-limit-told}.ts`, `candidate/trial-words.ts`, `runtime/conversations/commands/{build,execute,run-flow}.ts`, `runtime/result-verification/computed-facts/computed-no.ts`, and outside the owned list `framework/automation-service/service/project-build-ending/{record-told,readings-told}.ts`; matching test updates. `packages/ui-components/src/chat/`: `view/empty-state-model.ts`, `chat-widget.ts`, `stream/step/{superseded,action-card,messages,card-words}.ts`, tests.
Extension: `panel/open-fluxiq/{open-fluxiq-button,model-keys-address,index}.ts` (+2 test files), `panel/chat/chat-panel.ts`, `panel/recording/{index,review/index}.ts`, four review modules and two tests deleted.

## Commands run and observed results

- `pnpm.cmd --filter fluxiq check` (Core root): exit 0.
- `pnpm.cmd --filter @fluxiq/ui-components check`: exit 0.
- `pnpm.cmd --filter @fluxiq/contracts --filter fluxiq --filter @fluxiq/client-gateway-websocket --filter @fluxiq/ui-components build`: exit 0.
- `node scripts/structure-audit.mjs` (Core): `passed (488 warning(s), 1097 baselined)`. Extension repo: `passed (233 warning(s), 553 baselined)`. (First runs failed on barrel imports, a packed statement line, and a packed test file; fixed.)
- `pnpm.cmd exec vitest run --minWorkers 1 --maxWorkers 2 --reporter=dot` in `packages/ui-components`: `Test Files 83 passed (83), Tests 533 passed (533)`.
- packages/fluxiq vitest over `src/ui`, `src/runtime/automation-activity`, `src/runtime/conversations/commands`, `src/runtime/result-verification/computed-facts`, `src/framework/automation-service/service/project-build-ending`: `Test Files 121 passed (121), Tests 1169 passed (1169)`. Also run green: `src/runtime/activity`, `result-verification/tests/check-activity|check-card|check-words`, `project-build-facade`.
- Extension `node scripts/test-extension.mjs panel/` (label truth-pass): `tests 574, pass 574, fail 0`.
- `pnpm.cmd --filter @fluxiq-web-extension/extension check`: exit 0 (needed `pnpm.cmd --filter @fluxiq-web-extension/domain build` first; the worktree's domain was unbuilt, giving 14 unrelated TS2307/TS7006 errors).
- Visual spec `chat-truthful-visual.spec.ts` via `pnpm.cmd run test:content <spec> --workers=1`: **2 passed** (company-website, job-board), the overlay and chat bundles render, pill stable after one move, composer usable, chat fits width. It ran **headless** (the content config sets `headless: true`), not in a visible browser. The picture still shows the scripted note "The judged test run ... was judged not to do what was asked": that is the spec's own scripted input text, not product output.

## Not verified

- No live or visible-browser run; the on-page tick, the new neutral card, the new onboarding text and the model-key tab were never seen in a real extension. `window.open` from the side panel and the Firefox popup are untested.
- Core's broader suites (full `pnpm test`, whole vitest) not run, by the twice-a-day rule; only the named directories.
- Other person-facing strings that name "judge"/"trial" in framework/runtime that only reach the chat through unscreened rows may remain; the guard now fails the sweeps that exist, but those sweeps do not cover every producer.

## Open questions

1. **No-tick needs the overlay.** Proposed: add `unconfirmed` appearance in `content/activity-overlay/phase-appearance.ts` (neutral accent, "attention" or a new mark) and use it in `overlay-view.ts` when the headline is `Run finished, result not confirmed` or the display carries a flag. I did not own that path.
2. `record-told.ts`/`readings-told.ts` were edited outside the owned list because the failure note shown in the chat came from there.
3. Model-key button opens the tab from the panel, not through the background; if the lead prefers the background route, add a `purpose` to `panelOpenFluxIQ` (`background/panel/panel-control.ts`, `open-fluxiq.ts`) and revert the `window.open` branch.
4. The "Flow", "build" words stay (the guard does not ban them), though the plan says Flow and build go.

## Follow-up round (coordinator, same task)

1. **The tick: fixed.** Core `ActivityDisplay` gained a typed `unconfirmed?: true` (set by the pacer on a run that finished after an unconfirmed or unchecked result check). The overlay (`content/activity-overlay/overlay-view.ts`, `phase-appearance.ts`) draws it with a neutral grey, "attention" mark (no tick, no cross) and does not fade it, keyed on the field and never on words. Tests: `ui/activity-status/tests/unconfirmed-ending.test.ts` (Core pacer), `content/activity-overlay/tests/unconfirmed-view.test.ts` (extension; includes "the field decides, not the words").
2. **Model-key button: done through the background.** `PanelOpenFluxIQRequest` (shared/protocol.ts) carries `purpose: "model-key"`; `background/panel/panel-control.ts` opens `fluxIQKeysAddress(settings.coreApiUrl)` (`<address>/programs/secret-keys`, same http(s) check), refuses an unknown purpose, or one mixed with flowId/runId. The panel button sends the purpose; the earlier `window.open` code and `model-keys-address.ts` are removed. Tests: `background/panel/tests/open-purpose.test.ts`, `panel/open-fluxiq/tests/model-key-purpose.test.ts`.
3. **Sweep: done.** New `ui/person-facing/tests/producer-literals.test.ts` parses every string in the person-facing producers (`runtime/automation-activity`, `runtime/conversations/commands`, `result-verification/{check-activity,check-words,unsettled}`, `project-build-ending`, `ui/activity-action`, `ui/activity-status`; model-facing `describe`/`description`/`summary`/`instruction`/`brief`/`guidance` skipped; identifiers and codes with no space skipped) and fails on any internal term. It found and I fixed: "candidate draft" in a build cause (`build.ts`), "Core has no ... endpoint" (`port.ts`), "Core answered without the new Flow's id" (`create-here.ts`). Everything else it listed was a code or key (e.g. `candidate.trial_stale_revision`), not shown text. Not touched: model-facing strings (gate.ts, brief.ts, guidance, tool descriptions). Not covered by the test: ui-components strings and strings built outside the listed directories (e.g. `framework/.../run-repair.ts`, which is covered at display by `reason-text.ts`).
4. **Headed runs.** `chat-truthful-visual.spec.ts --headed`: 2 passed (company-website, job-board), same pictures. New `e2e/content/tests/activity-overlay/tests/panel-screens-capture.spec.ts` mounts the real `mountPanel` with a scripted background on company-website, headed, and saves `1-getting-started.png` ... `5-settings.png` under `apps/extension/e2e/test-results/content/artifacts/activity-overlay-tests-pan-4e37f--strip-and-Settings-screens/` (ignored folder). I viewed all five.

### What the captured screens show

Plainly untrue: nothing new found. Already fixed this task: the empty-chat paragraph and examples now read true (picture 2).
Not untrue but weak, listed, not changed:
- Getting started step 1 says "Start FluxIQ on this computer, or open it if it's already running" with an Open FluxIQ button; nothing says how to start it, and a fourth step (model key) and sign-in are not listed under "Three steps".
- The strip says "Last run: No AI needed · This run did not keep a change for future runs": the second clause reads as a warning though it is the good outcome (study journey 11). The "No AI needed" in the picture comes from my scripted run having no adaptations.
- Automations: "Record supporting evidence" and "Extract Data From This Page" under "New automation" keep the system's own words; "No AI needed" is the only line under a row with a run.
- Settings opens on two `ws://` / `http://` addresses; no model key, project or spending line.
- Top bar at 400 px shows a record icon, a status dot, a gear and an arrow with no words (title/aria only).

### Follow-up commands

- Core: `pnpm.cmd --filter fluxiq check` and `--filter @fluxiq/ui-components check`: no errors. `node scripts/structure-audit.mjs`: passed (488 warnings, 1097 baselined). ui-components vitest: 83 files, 533 tests passed. fluxiq vitest over `src/ui src/runtime/automation-activity src/runtime/conversations/commands src/runtime/result-verification/computed-facts src/runtime/result-verification/tests/check-activity.test.ts src/runtime/activity src/framework/automation-service/service/project-build-ending`: 125 files, 1181 tests passed.
- Extension: `pnpm.cmd --filter @fluxiq-web-extension/extension check`: no errors; structure audit passed (233 warnings, 553 baselined); `node scripts/test-extension.mjs` on `panel/`: 575/575, `background/panel/`: 66/66, `content/activity-overlay/`: 88/88.
- Both visual specs headed: chat-truthful 2 passed; panel-screens-capture 1 passed (14.5 s).

### Still open

- Only a scripted-background panel was seen; the real extension in Chrome and Firefox was not loaded. The keys-page open through the background was tested at the handler, not in a browser tab.
- The overlay's neutral mark was tested as a view model; its pixels were not captured.
