# P9-B1: Flow-authoring endpoint declarations

## Outcome
Done. All 75 endpoints in the nine handler files declare `assistant`: 22 exposed with real input schemas, 53 hidden with a reason.

## What changed
- Contracts (`packages/contracts/src/program-api/automation-studio/flows/`): moved `flow.ts` and its test into `flows/` (barrel updated, `automation-studio/index.ts` no longer exports `./flow.ts`); added `lifecycle.ts`, `instructions.ts`, `change-proposals.ts`, `build.ts`, `workspace.ts` (8 files + 6 tests in `flows/tests/`, well under 25).
  `flow.ts` gained get-flow, get-flow-metadata-detail and update-flow-settings.
- Handlers: an `assistant` entry on every registration in the nine files (inserted after `endpoint:`); handlers' own behaviour is untouched (none adopt `.parse`).
- Handler tests in `handlers/tests/assistant/` (own subfolder: the tests directory was already at the 25-file limit): helper `assistant-example.ts`, and `tests/{flows,flow-lifecycle,instructions,llm-generation,workspace}-assistant.test.ts`.

## Counts (exposed / hidden)
flows.ts 5/5; flow-lifecycle.ts 5/14; instructions.ts 7/0; llm-generation.ts 3/2; router.ts 0/12; subflows.ts 0/12; project-parts.ts 0/4; artifacts.ts 0/3; workspace.ts 2/1. Total 22/53.

## Decisions
- Subflow-related schema fields are left out of the exposed inputs (e.g. instruction `subflowId`, scope kinds `router`/`subflow`/`adaptation_review`); the handlers still accept them for existing callers.
- `update-flow-settings` exposes only name, description, visibility (the stored `metadata` settings are free-form and a model would guess keys).
- `delete-flow` keeps its derived class (delete); `publish-flow` etc. derive change. No `consequence` overrides added.
- `run-project-part` is hidden (retiring); it stays in the overrides table as `per-call`, harmless.
- `delete-flow` needs a PIN in the registry; the test stubs `authorizeSessionPin`. That is the PIN/press-grant question for the K lane, not changed here.

## Hidden endpoints and reasons
flows.ts
- list-flow-summaries: same list as list-flows in a lighter form for screens.
- list-flow-metadata-page: paged listing for the Flows screen.
- save-flow: saves a whole Flow document a screen built; people ask for one change at a time.
- apply-graph-patch: graph editor's low-level edits with revision numbers.
- get-graph-viewport: loads the on-screen part of the canvas.

flow-lifecycle.ts
- compile-flow-source: sent by the code editor on save.
- convert-flow-to-visual: one-time conversion button in the code editor.
- list-published-flow-nodes: fills the editor's palette.
- list-native-node-definitions: fills the editor's palette.
- inspect-flow-migration, migrate-flows, inspect-legacy-retirement, record-legacy-retirement-evidence, export-legacy-project, verify-legacy-backup, seal-legacy-writes, list-legacy-retirement-audit, plan-flow-migration-rollback, rollback-flow-migration (10): legacy storage migration, done by a migration tool.

llm-generation.ts
- save-flow-generation-instruction: build screen call needing the caller's session id; people give the words in chat.
- generate-flow-bootstrap-adaptation: the build itself, needs session and build options; builds start from the chat.

router.ts (12, subflow routing, retiring): get-flow-router, get-flow-router-summary, list-flow-router-routes, list-flow-router-target-references, get-flow-router-graph-summary, save-flow-map-route-group, delete-flow-map-route-group, save-flow-map-route, save-flow-map-fallback, test-flow-map-route-condition, mutate-flow-map-route, delete-flow-map-route.

subflows.ts (12, Subflows retiring): list-flow-subflows, list-flow-subflow-targets, get-flow-subflow, create-flow-subflow, migrate-legacy-flow-representation, update-flow-subflow, rename-flow-subflow, duplicate-flow-subflow, disable-flow-subflow, archive-flow-subflow, enable-flow-subflow, delete-flow-subflow.

project-parts.ts (4, parts are saved Subflows): list-project-parts, get-project-part, save-project-part, run-project-part.

artifacts.ts (3, raw documents for editor screens): get-project-artifact, save-project-artifact, delete-project-artifact.

workspace.ts
- list-project-artifacts: same raw-documents reason.

## Commands run and observed
- `cd packages/contracts && npx vitest run src/program-api` -> Test Files 9 passed, Tests 32 passed.
- `cd packages/fluxiq && npx vitest run --no-file-parallelism <assistant tests, flows, instructions, llm-generation, router, project-parts, assistant-parity>` -> the assistant tests, flows.test.ts (12), llm-generation.test.ts (24), project-parts (12) passed; the only failure was the parity test, whose printed remaining list holds 113 endpoints and none of the 75 in my nine files (checked programmatically: overlap []). Remaining entries are other files and `secret-keys__*`.
- After moving the tests into `assistant/tests/`: `npx vitest run --no-file-parallelism handlers/tests/assistant subflows.test.ts instructions.test.ts` -> Test Files 7 passed, Tests 10 passed. (Parallel runs of the same files crashed a worker with "Worker exited unexpectedly", likely memory; serial runs are clean. router.test.ts passed in the earlier serial run.)
- `node scripts/structure-audit.mjs` -> `structure-audit: passed (535 warning(s), 1095 baselined).` (an earlier run failed on test-placement for my files and on a secret-keys class; both resolved).
- fluxiq typecheck (`tsc --noEmit --incremental`, lock taken and removed, 4078 MB free) -> exit 0, no output.

## Not verified
- Web typecheck and any other package importing `automation-studio/flow.ts` by path (grep found only the barrel).
- The generated assistant-tools file was not regenerated (supervisor's step).
- Handler tests cover acceptance of the example, not every optional field.

## Open questions
- Whether `get-flow` (returns a whole Flow, large) should stay exposed or sit behind `find_tools` only.
