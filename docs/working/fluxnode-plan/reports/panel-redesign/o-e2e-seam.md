# P9-O: the e2e seam for the new panel

## Outcome

Done in my paths, with three product gaps the supervisor must know before running Playwright (see Open questions 1 to 3). Not run: Playwright and the panel, per the brief. The full (non-fast) seed was not run; the fast seed was.

## What changed and why

**Scripted assistant, Core** (`packages/fluxiq/src/runtime/conversations/assistant/model/`):
- `scripted/script.ts`, `scripted/answer-value.ts`, `scripted/model.ts`, `scripted/index.ts`: a `PanelAssistantModel` that replays a script. A script is `{ scenarios: [{ when, turns }], after?, otherwise? }`. The scenario is chosen by words the person's latest message contains. The next decision is the scenario's turn at the position "number of tool answers after that message", read from the transcript, so nothing is remembered between calls and it also works after a person presses Allow (the continuation holds only the allowed call's answer). A value `{ "$answer": "revision" }` in a tool's input is read from the last tool answer (needed because `edit-flow-steps` requires `baseRevision`); a path that leads nowhere throws a plain error. Cost is always 0. The script is re-read at every decision.
- `fixture-host-constants.ts`, `is-fixture-host.ts`, `fixture-host-model-source.ts`: `panelAssistantFixtureHostModelSource({ rootDir, env, fallback })` returns the scripted source only when `FLUXIQ_E2E_SCRIPTED_ASSISTANT` is `1`/`true` AND `<rootDir>/.fluxiq-e2e-fixture-root` holds `fluxiq-e2e-fixture-v1` (the marker the seed already writes); otherwise it returns `fallback` itself. The script file is `<rootDir>/e2e-assistant-script.json`.
- `programs/_shared/runtime.ts`: only the panel-assistant block (key source is built, then wrapped by the fixture-host source with `paths?.root` and `process.env`) and its import line.
- Tests: `model/tests/fixture-host-model-source.test.ts` (6: refused without marker, refused with a wrong marker, refused without the variable or with `0`, refused with no data directory, answers from the script on the fixture host, plain error when the script is missing) and `model/scripted/tests/model.test.ts` (5).

**Seed** (`apps/web/e2e/support/seed-fixtures.mjs`): new "Panel Fixture" project, so counts the old fixtures verify do not move. Flows "Old search" (12 runs, 2 failed), "Spare copy", "Cheapest listings"; the last one's Subflow graph Flow holds four steps (labels "Open the catalog page", "Type the search words" with a text value, "Press the search button", "Read the first result"); two model keys with made-up values, created through Secret Keys. Everything is written to the manifest key `panel`. `verify-fixtures.mjs` gets a `panel` target (names, 12 runs with passed and failed, four step labels, two keys).

**Helpers and specs** (`apps/web/e2e/`): `support/panel-fixture.ts` (`signInToPanel`, `panelFixtureOf`, `assistantDock`, `openAssistantDock`, `sendToAssistant`, `writeAssistantScript`), `PanelFixture` type and `root` added to `UiFixtureManifest`. `panel-assistant.spec.ts` (3 serial tests). The five panel specs now sign in with `signInToPanel` (the old `authenticate` waits for the retired "Programs" heading); `panel-shell` uses the shared dock helpers; `panel-flows` opens the seeded editable Flow instead of searching the old `small` project. README: new "Panel specs" section.

## Commands run and observed results

- `cd packages/fluxiq && npx vitest run src/runtime/conversations/assistant/model` -> `Test Files 4 passed (4)`, `Tests 16 passed (16)`.
- `FLUXIQ_E2E_FAST_STUDIO=true node e2e/support/seed-fixtures.mjs` (from apps/web) -> exit 0; manifest has the `panel` block.
- `FLUXIQ_E2E_VERIFY_TARGET=panel node e2e/support/verify-fixtures.mjs` -> `panelFixture: runs 12, runStatuses [failed, succeeded], editableSteps 4, modelKeys 2`.
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (522 warning(s), 970 baselined)`. It first failed on a `failure-as-empty` catch and a `scripted-` filename prefix; both fixed at the cause (a non-JSON tool entry is skipped by its shape, not by catching; the files moved to `model/scripted/`). It also says 2 baseline entries can be lowered; I did not run `pnpm structure:baseline`.
- fluxiq typecheck under the lock (4.8 GB free): `tsc --noEmit --incremental ...` -> exit 0.
- web typecheck under the lock: exit 2 with one error, `src/features/automation-studio/runtime/tests/run-control-interactions.test.tsx(13,43): Cannot find module '../../workspace/shell/WorkspaceHeader'`, which is the old UI being retired by another worker. No error in `e2e/**`.

## Not verified

- No Playwright run, no panel started: every spec, the assistant card flow and the dock selectors ("Message to FluxIQ", "Send", "Allow") are untested against the real page.
- The full seed (scale1k, scale10k, global stress) was not run (memory was 2.3 to 2.9 GB at the time); only the fast seed. `fixture:e2e:verify` with no target was not run. `apps/web/.e2e-host` currently holds the fast seed, so reseed.
- That `paths.root` in `runtime.ts` equals `FLUXIQ_IMPORTER_ROOT` (the marker's directory); if the host uses another root the scripted source stays off and the assistant says it has no model.
- That the outline's step words use the seeded labels and that `get-flow-outline` / `edit-flow-steps` accept the seeded graph (outputId `site.output.press` is not registered anywhere).
- The tool name `automation-studio__get-flow-outline` and the card text `Delete the Flow “Spare copy”?` are taken from the generated catalog and `consent/confirm-words.ts`, not observed.

## Open questions or contradictions found

1. **The Allow card says "Yes"/"No", not "Allow".** `packages/ui-components/src/chat/conversation/ask-copy.ts` gives a `confirm` ask the buttons Yes and No (F2 open item 8). The spec asks for a button named exactly "Allow", so the third assistant test fails until that file changes (`Allow` / `Don't allow` for `confirm`). I did not loosen the spec to accept Yes.
2. **Top-level Flows own no steps, so the editor cannot edit a normal Flow.** `edit-flow-steps` and the outline's graph read refuse or return nothing for a top-level orchestration Flow (`assertFlowGraphMutationAllowed`); steps live on the Subflow graph Flow, which `list-flow-summaries` hides. The specs therefore open the graph Flow id directly (`panel.editableFlowId`). This is K2's open question; the editor should resolve a Flow to its primary Subflow graph, otherwise a person opening any real Flow sees no steps. Not fixed here (not my paths).
3. **The editor does not refresh after the assistant edits.** Nothing in `features/flows` reacts to an assistant change, so the rename test opens the editor again before it expects the new words. A refresh when the dock finishes a message would let the test assert it live.
4. A scenario whose call waits for Allow must have that call first: after Allow the model sees only the allowed call's answer, so the position restarts. Documented in the README and the model's comment.
5. `UiFixtureManifest` now types `root`; the seed already wrote it.
